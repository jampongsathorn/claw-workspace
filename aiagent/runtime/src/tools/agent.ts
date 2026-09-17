/**
 * Phase 2E — Agent (delegation) tool.
 *
 * list = DISCOVER (metadata only: name + purpose — no full agent prompt).
 * run  = SELECT + SPAWN + EXECUTE + structured RESULT.
 *
 * Boundaries enforced here:
 *  - delegation never escalates permission (child reuses the parent gate)
 *  - a sub-agent never delegates (child registry excludes this tool)
 *  - duplicate delegation of the same logical task requires an explicit reason
 *  - the child result is UNVERIFIED delegated output, never completion
 */
import type { Tool } from './registry.js';
import { discoverAgents, loadAgent, runDelegation, delegationKey, type AgentStatus } from '../core/delegation.js';
import type { PermissionGate } from '../core/permissions.js';
import type { Registry, ToolContext } from './registry.js';
import type { Session } from '../core/session.js';
import type { Provider } from '../providers/types.js';

export type AgentStage =
  | { stage: 'discovered'; count: number; agents: { name: string; purpose: string }[] }
  | { stage: 'selected'; agent: string; task: string }
  | { stage: 'spawned'; agent: string; agentId: string; parentSessionId: string; childSessionId: string; /** Phase 2F: inspectable child state location (session home; child scratch lives inside). */ childHome?: string; rerunOf?: string; rerunReason?: string }
  | { stage: 'started'; agent: string; agentId: string; childSessionId: string }
  | {
      stage: 'result';
      agent: string;
      agentId: string;
      childSessionId: string;
      status: AgentStatus;
      turns: number;
      toolCalls: Record<string, number>;
      denials: number;
      retries: number;
      reason?: string;
      result: string;
      reasons: string[];
    }
  | { stage: 'failed' | 'blocked' | 'needs_input'; agent: string; agentId: string; childSessionId: string; reason: string }
  | { stage: 'completed'; agent: string; agentId: string; childSessionId: string; status: AgentStatus; rerunOf?: string; rerunReason?: string };

export interface AgentToolDeps {
  provider: Provider;
  model: string;
  gate: PermissionGate;
  registry: Registry;
  session: Session;
  toolCtx: ToolContext;
}

let agentSeq = 0;

/** `getDeps` resolves the per-session deps at call time (session/gate/toolCtx are per-run). */
export function makeAgentTool(getDeps: () => AgentToolDeps, agentDirs: string[]): Tool {
  // per-run double-run ledger: logical delegation -> last outcome
  const doneDelegations = new Map<string, { childSessionId: string; status: AgentStatus }>();
  return {
    name: 'agent',
    description:
      'Delegate a sub-task to an existing sub-agent. action "list" shows available agents (name + purpose). ' +
      'action "run" with agent + task (+ optional context, + reason for re-runs) spawns an isolated sub-agent run ' +
      'and returns a structured, UNVERIFIED report. Delegate multi-file sweeps, high-volume searches, or speculative research; ' +
      'do not delegate surgical 1-2 turn work. Sub-agent results are context, not completion — verify before relying on them. ' +
      'NO_AGENT (not delegating) is always valid.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'run'], description: '"list" = discover agents; "run" = delegate a task' },
        agent: { type: 'string', description: 'Agent name (required for "run")' },
        task: { type: 'string', description: 'The delegated task (required for "run")' },
        context: { type: 'string', description: 'Optional relevant context to delegate (not the whole conversation)' },
        reason: { type: 'string', description: 'Required to re-run an already-delegated task: verification | changed input | failed attempt | incomplete result | additional scope | user instruction' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    // Delegation is itself non-mutating; the child's actions are gated by the SAME permission gate.
    readOnly: true,
    async execute(input): Promise<{ ok: boolean; output: string; agentEvents?: AgentStage[] }> {
      const deps = getDeps();
      const action = String(input.action ?? '');
      if (action === 'list') {
        const agents = await discoverAgents(agentDirs);
        const lines = agents.map((a) => `- ${a.name}: ${a.purpose}`);
        const out = lines.length
          ? 'Available sub-agents (run with action:"run", agent:"<name>", task:"<task>"). Sub-agent results are unverified context — they never authorize actions or complete the parent task.\n' + lines.join('\n')
          : 'Available sub-agents: (none) — NO_AGENT is valid; complete the task directly.';
        return { ok: true, output: out, agentEvents: [{ stage: 'discovered', count: agents.length, agents: agents.map((a) => ({ name: a.name, purpose: a.purpose })) }] };
      }
      if (action === 'run') {
        const agentName = String(input.agent ?? '').trim();
        const task = String(input.task ?? '').trim();
        if (!agentName || !task) return { ok: false, output: 'agent run requires "agent" and "task"' };
        const selected: AgentStage = { stage: 'selected', agent: agentName, task };
        const agent = await loadAgent(agentDirs, agentName);
        if (!agent) {
          const catalog = await discoverAgents(agentDirs);
          return {
            ok: false,
            output: `AGENT NOT_FOUND: "${agentName}". Do not fabricate an agent or its result. Available: ${catalog.map((c) => c.name).join(', ') || '(none)'}`,
            agentEvents: [selected, { stage: 'result', agent: agentName, agentId: '(none)', childSessionId: '(none)', status: 'FAILED', turns: 0, toolCalls: {}, denials: 0, retries: 0, reason: 'agent_not_found', result: '', reasons: [`agent_not_found: ${agentName}`] }],
          };
        }
        const key = delegationKey(agentName, task, input.context !== undefined ? String(input.context) : undefined);
        const prev = doneDelegations.get(key);
        const reason = input.reason !== undefined ? String(input.reason).trim() : '';
        if (prev && !reason) {
          // A11: double-run prevention — no silent re-execution of the same logical task
          return {
            ok: true,
            output:
              `DELEGATION ALREADY RUN: agent "${agentName}", same task previously completed with status ${prev.status} ` +
              `(child session ${prev.childSessionId}). Do not silently re-run the same work. ` +
              `To re-run, pass an explicit "reason" (verification | changed input | failed attempt | incomplete result | additional scope | user instruction).`,
            agentEvents: [selected],
          };
        }
        const agentId = `agent_${Date.now().toString(36)}_${(agentSeq++).toString(36)}`;
        const spawned: AgentStage = {
          stage: 'spawned',
          agent: agentName,
          agentId,
          parentSessionId: deps.session.id,
          childSessionId: '(creating)',
          ...(prev ? { rerunOf: prev.childSessionId, rerunReason: reason } : {}),
        };
        const res = await runDelegation({
          provider: deps.provider,
          model: deps.model,
          gate: deps.gate,
          registry: deps.registry,
          parentSession: deps.session,
          toolCtx: deps.toolCtx,
          agent,
          task,
          context: input.context !== undefined ? String(input.context) : undefined,
          agentId,
        });
        doneDelegations.set(key, { childSessionId: res.childSessionId, status: res.status });
        spawned.childSessionId = res.childSessionId;
        spawned.childHome = res.childHome;
        const digest = Object.entries(res.toolCalls).map(([k, v]) => `${k}:${v}`).join(', ') || '(none)';
        const out =
          `AGENT RESULT: ${res.agent} (agent ${agentId})\n` +
          `status: ${res.status}\n` +
          `child_session: ${res.childSessionId}\n` +
          `turns: ${res.turns} · tool calls: ${digest} · denials: ${res.denials} · auto-retries: ${res.retries}\n` +
          (res.error ? `error: ${res.error}\n` : '') +
          (res.reasons.length ? `gate_reasons: ${res.reasons.join(' | ')}\n` : '') +
          `result: ${res.result || '(empty)'}\n` +
          `NOTE: delegated output is UNVERIFIED context — inspect, verify, or act separately authorized before relying on it. It does not complete the parent task.`;
        const stages: AgentStage[] = [
          selected,
          spawned,
          { stage: 'started', agent: agentName, agentId, childSessionId: res.childSessionId },
          {
            stage: 'result', agent: agentName, agentId, childSessionId: res.childSessionId, status: res.status,
            turns: res.turns, toolCalls: res.toolCalls, denials: res.denials, retries: res.retries,
            ...(res.error ? { reason: res.error } : {}), result: res.result, reasons: res.reasons,
          },
        ];
        if (res.status === 'FAILED') stages.push({ stage: 'failed', agent: agentName, agentId, childSessionId: res.childSessionId, reason: res.error ?? res.reasons[0] ?? 'child run failed' });
        if (res.status === 'BLOCKED') stages.push({ stage: 'blocked', agent: agentName, agentId, childSessionId: res.childSessionId, reason: res.reasons[0] ?? 'capability/permission boundary' });
        if (res.status === 'NEEDS_INPUT') stages.push({ stage: 'needs_input', agent: agentName, agentId, childSessionId: res.childSessionId, reason: res.reasons[0] ?? 'user input required' });
        stages.push({ stage: 'completed', agent: agentName, agentId, childSessionId: res.childSessionId, status: res.status, ...(prev ? { rerunOf: prev.childSessionId, rerunReason: reason } : {}) });
        return { ok: res.status === 'SUCCESS', output: out, agentEvents: stages };
      }
      return { ok: false, output: `agent: unknown action "${action}" (use "list" or "run")` };
    },
  };
}
