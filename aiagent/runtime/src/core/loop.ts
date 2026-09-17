/**
 * The agentic loop (single-threaded, per the harness research):
 * call model → execute tool calls → feed results back → repeat until the
 * model outputs text only, or a stop condition fires (max turns, loop
 * detection, error, permission denial of a required action).
 */
import { createHash } from 'node:crypto';
import type { AgentEvent, Usage } from './events.js';
import { addUsage, emptyUsage } from './events.js';
import type { Provider, ProviderMessage, ToolCall } from '../providers/types.js';
import type { Registry, ToolContext } from '../tools/registry.js';
import { truncateOutput } from '../tools/registry.js';
import type { PermissionGate } from './permissions.js';
import { evaluateCompletion } from './completion.js';
import type { CompletionContract, RunEvidence } from './completion.js';
import { RecoveryBudget, actionKey, classifyFailure, DEFAULT_RECOVERY } from './recovery.js';
import type { FailureInfo, RecoveryLimits } from './recovery.js';
import { pruneMessages, DEFAULT_CONTEXT_BUDGET_CHARS } from './prune.js';
import type { Session } from './session.js';

export interface LoopDeps {
  provider: Provider;
  model: string;
  system: string;
  registry: Registry;
  session: Session;
  gate: PermissionGate;
  toolCtx: ToolContext;
  maxTurns?: number;
  /** Initial user prompt (new sessions). */
  userPrompt?: string;
  /**
   * Phase 2A completion contract. When present, a text-only turn is a
   * completion REQUEST: the final state is decided by the deterministic
   * completion gate (evaluateCompletion), never by the model's prose.
   * When absent, Phase 1 behavior is preserved (done as before).
   */
  contract?: CompletionContract;
  /**
   * Phase 2C recovery budget overrides. Defaults: 1 auto-retry per identical
   * action, 3 total auto-retries per run (harness-owned; the model cannot
   * influence them). Reset per runLoop invocation (task/run boundary).
   */
  recovery?: Partial<RecoveryLimits>;
  /**
   * Phase 2F: request-context budget in chars (deterministic; default
   * AIAGENT_CONTEXT_BUDGET or 200k). Prunes historical tool output first —
   * never the system prompt, current task, user messages, or active exchange.
   */
  contextBudget?: number;
}

let toolIdSeq = 0;
const nextToolId = () => `call_${Date.now().toString(36)}_${(toolIdSeq++).toString(36)}`;

export async function* runLoop(deps: LoopDeps): AsyncGenerator<AgentEvent> {
  const { provider, model, system, registry, session, gate, toolCtx } = deps;
  const maxTurns = deps.maxTurns ?? 50;
  const usage: Usage = emptyUsage();

  if (deps.userPrompt) {
    await session.appendMessage({ role: 'user', content: deps.userPrompt });
  }
  yield {
    type: 'init',
    sessionId: session.id,
    model,
    provider: provider.id,
    promptVersion: session.meta.promptVersion,
    stableHash: session.meta.stableHash,
    platform: session.meta.surface === 'interactive' ? session.meta.surface : session.meta.surface,
    surface: session.meta.surface,
  };

  const recent: string[] = [];
  let turns = 0;
  let error: string | undefined;
  const evidence: RunEvidence = { finalText: '', toolResults: [], denials: [] };
  const recovery = new RecoveryBudget({ ...DEFAULT_RECOVERY, ...deps.recovery });

  while (turns < maxTurns) {
    turns++;
    yield { type: 'turn', n: turns };

    // Phase 2F: deterministic context budget. Pruning affects the REQUEST only —
    // the session log and completion evidence keep the full history. Core/system
    // context (authorization, security, completion requirements) is never pruned.
    const budget = deps.contextBudget ?? DEFAULT_CONTEXT_BUDGET_CHARS;
    const pruned = pruneMessages(session.messages, budget);
    if (pruned.report) {
      yield { type: 'context_pruned', systemChars: system.length, ...pruned.report };
    }
    const request = { model, system, messages: pruned.messages, tools: registry.specs() };

    let result;
    try {
      result = await provider.complete(request);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /429|5\d\d|timeout|ECONN/i.test(msg);
      yield { type: 'error', message: msg, retryable };
      if (retryable && turns < maxTurns) {
        // one retry, once per loop
        try {
          result = await provider.complete(request);
        } catch (e2) {
          error = e2 instanceof Error ? e2.message : String(e2);
          break;
        }
      } else {
        error = msg;
        break;
      }
    }

    Object.assign(usage, addUsage(usage, result.usage));

    if (result.thoughts) yield { type: 'assistant_thought', text: result.thoughts };
    const hasText = result.text.trim().length > 0;
    if (hasText) yield { type: 'assistant_text', text: result.text };

    if (result.toolCalls.length === 0) {
      await session.appendMessage({ role: 'assistant', content: result.text });
      evidence.finalText = result.text;
      const completion = deps.contract ? evaluateCompletion(deps.contract, evidence, toolCtx.cwd) : undefined;
      yield { type: 'done', turns, usage, error, completion };
      return;
    }

    await session.appendMessage({
      role: 'assistant',
      content: result.text,
      toolCalls: result.toolCalls,
    });

    for (const tc of result.toolCalls) {
      const tool = registry.get(tc.name);
      yield { type: 'tool_call', id: tc.id, name: tc.name, input: tc.input };

      if (!tool) {
        const out = `unknown tool: ${tc.name}`;
        const f = classifyFailure({ ok: false, output: out, kind: 'unknown_tool' });
        evidence.toolResults.push({ name: tc.name, ok: false, output: out, input: tc.input, classification: f.classification, attempt: 1, retriesUsed: 0 });
        yield { type: 'tool_result', id: tc.id, name: tc.name, ok: false, output: out, failure: { classification: f.classification, retryable: f.retryable, attempt: 1, retriesUsed: 0 } };
        await session.appendMessage({ role: 'tool', toolCallId: tc.id, name: tc.name, output: out, isError: true });
        continue;
      }

      // loop detection: same tool + same input 3 times in a row
      const sig = createHash('sha256').update(tc.name + JSON.stringify(tc.input)).digest('hex');
      recent.push(sig);
      if (recent.length > 3) recent.shift();
      if (recent.length === 3 && recent.every((s) => s === sig)) {
        yield { type: 'loop_detected', tool: tc.name, repeats: 3 };
        error = `loop detected: ${tc.name} called 3× with identical input — stopping`;
        const out = 'LOOP DETECTED: stop repeating this exact call. Change strategy or report what is blocked.';
        const f = classifyFailure({ ok: false, output: out, kind: 'loop_detected' });
        evidence.toolResults.push({ name: tc.name, ok: false, output: out, input: tc.input, classification: f.classification, attempt: 1, retriesUsed: 0 });
        yield { type: 'tool_result', id: tc.id, name: tc.name, ok: false, output: out, failure: { classification: f.classification, retryable: f.retryable, attempt: 1, retriesUsed: 0 } };
        await session.appendMessage({ role: 'tool', toolCallId: tc.id, name: tc.name, output: out, isError: true });
        break;
      }

      const summary = summarizeInput(tc);
      const decision = await gate.decide(tool, summary);
      const key = actionKey(tc.name, tc.input);
      type ExecResult = { ok: boolean; output: string; exitCode?: number | null; stdout?: string; stderr?: string; skillEvents?: import('../tools/skill.js').SkillStage[]; agentEvents?: import('../tools/agent.js').AgentStage[]; stateEvents?: import('../tools/state.js').StateStage[]; exec?: import('../tools/exec.js').ExecEvidence };
      let result2: ExecResult;
      let failure: FailureInfo | undefined;
      let retriesUsed = 0;
      let attempt = 1;
      if (!decision.allow) {
        // Permission denial: never retried (Phase 1/2A behavior preserved).
        result2 = { ok: false, output: decision.reason ?? 'denied' };
        failure = classifyFailure({ ok: false, output: result2.output, kind: 'denied' });
        evidence.denials.push({
          tool: tc.name,
          reason: decision.reason ?? 'denied',
          prompted: (decision.reason ?? '') === 'denied by user', // exact reason text from permissions.ts
          atResultIndex: evidence.toolResults.length,
        });
      } else {
        recovery.recordExecution(key);
        attempt = recovery.attemptOf(key);
        const execOnce = async (): Promise<ExecResult> => {
          try {
            const r = await tool.execute(tc.input, toolCtx);
            const t = truncateOutput(r.output);
            return { ok: r.ok, output: t.output, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, skillEvents: r.skillEvents, agentEvents: r.agentEvents, stateEvents: r.stateEvents, exec: r.exec };
          } catch (e) {
            return { ok: false, output: `tool error: ${e instanceof Error ? e.message : String(e)}` };
          }
        };
        result2 = await execOnce();
        // Phase 2C bounded recovery: classify from machine evidence; auto-retry
        // the SAME action+input only for transient failures, limited by the
        // harness budget. The harness never invents a different action — when
        // recovery stops, structured evidence returns to the model. Every failed
        // attempt is machine-observable (event + evidence); the session history
        // keeps only the final result per tool-call id (provider protocol).
        while (!result2.ok) {
          failure = classifyFailure({ ok: false, output: result2.output, kind: tool.name === 'exec' ? 'exec' : 'tool_error', exitCode: result2.exitCode });
          if (!failure.retryable) break;
          const c = recovery.canRetry(key);
          if (!c.allowed) {
            yield { type: 'recovery_exhausted', tool: tc.name, id: tc.id, classification: failure.classification, reason: c.reason, retriesUsed, totalRetriesUsed: recovery.totalRetries };
            break;
          }
          // record the failed attempt (event + evidence) before the bounded retry
          evidence.toolResults.push({ name: tc.name, ok: false, output: result2.output, input: tc.input, exitCode: result2.exitCode, stdout: result2.stdout, stderr: result2.stderr, classification: failure.classification, attempt, retriesUsed });
          yield { type: 'tool_result', id: tc.id, name: tc.name, ok: false, output: result2.output, failure: { classification: failure.classification, retryable: failure.retryable, attempt, retriesUsed, exitCode: result2.exitCode } };
          recovery.consume(key);
          retriesUsed++;
          attempt++;
          yield { type: 'retry', tool: tc.name, id: tc.id, attempt, classification: failure.classification, retriesUsed, totalRetriesUsed: recovery.totalRetries };
          result2 = await execOnce();
        }
        if (result2.ok) failure = undefined; // a recovered success is not a failure
      }
      evidence.toolResults.push({
        name: tc.name, ok: result2.ok, output: result2.output, input: tc.input,
        exitCode: result2.exitCode, stdout: result2.stdout, stderr: result2.stderr,
        classification: failure?.classification, attempt, retriesUsed, exec: result2.exec,
      });
      // Phase 2D: machine-observable skill lifecycle stages (tool-provided, not model prose)
      for (const se of result2.skillEvents ?? []) {
        if (se.stage === 'discovered') yield { type: 'skill_discovered', count: se.count, skills: se.names };
        else if (se.stage === 'selected') yield { type: 'skill_selected', name: se.name };
        else if (se.stage === 'loaded') yield { type: 'skill_loaded', name: se.name, path: se.path, contentHash: se.contentHash, chars: se.chars };
        else yield { type: 'skill_load_failed', name: se.name, reason: se.reason };
      }
      // Phase 2E: machine-observable delegation lifecycle (tool-provided; model prose
      // "I delegated this" never generates these events)
      for (const se of result2.agentEvents ?? []) {
        if (se.stage === 'discovered') yield { type: 'agent_discovered', count: se.count, agents: se.agents };
        else if (se.stage === 'selected') yield { type: 'agent_selected', agent: se.agent, task: se.task };
        else if (se.stage === 'spawned') yield { type: 'agent_spawned', agent: se.agent, agentId: se.agentId, parentSessionId: se.parentSessionId, childSessionId: se.childSessionId, ...(se.childHome ? { childHome: se.childHome } : {}), ...(se.rerunOf ? { rerunOf: se.rerunOf, rerunReason: se.rerunReason } : {}) };
        else if (se.stage === 'started') yield { type: 'agent_started', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId };
        else if (se.stage === 'result') yield { type: 'agent_result', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId, status: se.status, turns: se.turns, toolCalls: se.toolCalls, denials: se.denials, retries: se.retries, ...(se.reason ? { error: se.reason } : {}), result: se.result, reasons: se.reasons };
        else if (se.stage === 'failed') yield { type: 'agent_failed', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId, reason: se.reason };
        else if (se.stage === 'blocked') yield { type: 'agent_blocked', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId, reason: se.reason };
        else if (se.stage === 'needs_input') yield { type: 'agent_needs_input', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId, reason: se.reason };
        else if (se.stage === 'completed') yield { type: 'agent_completed', agent: se.agent, agentId: se.agentId, childSessionId: se.childSessionId, status: se.status, ...(se.rerunOf ? { rerunOf: se.rerunOf, rerunReason: se.rerunReason } : {}) };
      }
      // Phase 2F: machine-observable state operations (tool-provided; model prose
      // "I'll remember this" never generates state events — only explicit tool calls do,
      // and events carry id/counts, never content)
      for (const se of result2.stateEvents ?? []) {
        if (se.stage === 'read') yield { type: 'state_read', store: se.store, ...(se.id ? { id: se.id } : {}), ...(se.count !== undefined ? { count: se.count } : {}) };
        else if (se.stage === 'written') yield { type: 'state_written', store: se.store, ...(se.id ? { id: se.id } : {}), ...(se.bytes !== undefined ? { bytes: se.bytes } : {}), ...(se.source ? { source: se.source } : {}) };
        else if (se.stage === 'promoted') yield { type: 'state_promoted', from: se.from, to: se.to, ...(se.id ? { id: se.id } : {}), reason: se.reason };
        else yield { type: 'state_cleared', store: se.store, ...(se.id ? { id: se.id } : {}) };
      }
      const shown = result2.output.length > 4000 ? result2.output.slice(0, 4000) + '…' : result2.output;
      const failureEvent = !result2.ok && failure
        ? { classification: failure.classification, retryable: failure.retryable, attempt, retriesUsed, exitCode: result2.exitCode }
        : undefined;
      yield { type: 'tool_result', id: tc.id, name: tc.name, ok: result2.ok, output: shown, ...(failureEvent ? { failure: failureEvent } : {}), ...(result2.exec ? { exec: result2.exec } : {}) };
      await session.appendMessage({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        output: result2.output,
        isError: !result2.ok,
      });
    }
    if (error) break;
  }

  if (!error) yield { type: 'max_turns', turns };
  yield { type: 'done', turns, usage, error };
}

function summarizeInput(tc: ToolCall): string {
  const i = tc.input;
  if (typeof i.command === 'string') return i.command.slice(0, 120);
  if (typeof i.path === 'string') return `${i.path}${i.old_string !== undefined ? ' (edit)' : ''}`;
  if (typeof i.pattern === 'string') return `"${i.pattern}"`;
  if (typeof i.question === 'string') return i.question.slice(0, 120);
  return JSON.stringify(i).slice(0, 120);
}
