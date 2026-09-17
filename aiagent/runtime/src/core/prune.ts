/**
 * Phase 2F — deterministic context budget / pruning.
 *
 * Pure function over the message history: it decides WHAT the model sees on a
 * given request. The durable session log and the completion gate's evidence
 * always keep the full history — pruning affects the request context only.
 *
 * Policy (deterministic, oldest-first, class priority):
 *   NEVER pruned: the system prompt (core contract, authorization, security,
 *   completion requirements, state sections), the first user message (current
 *   task), the most recent exchange, any user message (task input).
 *   Pruned first: historical TOOL RESULTS (largest, lowest-priority class) —
 *   replaced by an honest marker that says the content is NOT in the current
 *   context and how to get it back (re-read / re-run).
 *   Pruned second (if still over): older ASSISTANT text — truncated, tool
 *   call structure preserved.
 *
 * The runtime never silently claims discarded context still exists: every
 * replacement is an explicit marker, and each pruning pass is a machine
 * event (context_pruned) with per-class char accounting.
 */
import type { ProviderMessage } from '../providers/types.js';

/** Default context budget in CHARS (deterministic proxy for tokens). */
export const DEFAULT_CONTEXT_BUDGET_CHARS = Number(process.env.AIAGENT_CONTEXT_BUDGET ?? 200_000);

export interface PruneReport {
  charsBefore: number;
  charsAfter: number;
  /** tool-result messages replaced by honest markers. */
  prunedToolResults: number;
  /** assistant text messages truncated. */
  prunedAssistantTexts: number;
  /** delegated-result (agent tool) messages replaced — separate class for observability. */
  prunedDelegatedResults: number;
  /** char accounting of what remains, by class. */
  remaining: { conversationChars: number; toolOutputChars: number; delegatedChars: number };
  policy: string;
}

export interface PruneOutcome {
  messages: ProviderMessage[];
  report: PruneReport | null;
}

function msgChars(m: ProviderMessage): number {
  if (m.role === 'tool') return m.output.length;
  return m.content.length;
}

const TOOL_MARKER = (name: string, chars: number): string =>
  `[context pruned — ${name ?? 'tool'} result of ${chars} chars is NOT in the current context. ` +
  `If still needed, re-read the file or re-run the tool; do not assume the discarded output.]`;
const ASSISTANT_MARKER = (chars: number): string => `[…assistant text pruned: ${chars} chars removed from context…]`;

export function totalChars(messages: ProviderMessage[]): number {
  return messages.reduce((n, m) => n + msgChars(m), 0);
}

export function pruneMessages(messages: ProviderMessage[], budgetChars: number): PruneOutcome {
  const before = totalChars(messages);
  if (before <= budgetChars) return { messages: messages.slice(), report: null }; // snapshot, never the live array

  // work on a copy; never mutate the session's stored history
  const out: ProviderMessage[] = messages.map((m) => ({ ...m }));
  let prunedToolResults = 0;
  let prunedDelegatedResults = 0;
  let prunedAssistantTexts = 0;

  const under = () => totalChars(out) <= budgetChars;

  // pass 1 — historical tool results, oldest first. The last message is
  // protected (it belongs to the current exchange).
  for (let i = 0; i < out.length - 1 && !under(); i++) {
    const m = out[i];
    if (m.role === 'tool' && 'output' in m && typeof m.output === 'string' && m.output.length > 80) {
      const chars = m.output.length;
      m.output = TOOL_MARKER(m.name ?? 'tool', chars);
      m.isError = false; // the marker is informational, not an error
      if (m.name === 'agent') prunedDelegatedResults++;
      else prunedToolResults++;
    }
  }

  // pass 2 — older assistant text (oldest first), preserving tool-call structure.
  // Skip the first user message (the current task) and the last 4 messages
  // (the active exchange).
  const protectedFrom = Math.max(0, out.length - 4);
  for (let i = 0; i < protectedFrom && !under(); i++) {
    const m = out[i];
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 200) {
      const removed = m.content.length - 200;
      m.content = m.content.slice(0, 200) + '\n' + ASSISTANT_MARKER(removed);
      prunedAssistantTexts++;
    }
  }

  const remaining = { conversationChars: 0, toolOutputChars: 0, delegatedChars: 0 };
  for (const m of out) {
    if (m.role === 'tool') {
      const o = typeof m.output === 'string' ? m.output.length : 0;
      if (m.name === 'agent') remaining.delegatedChars += o;
      else remaining.toolOutputChars += o;
    } else {
      remaining.conversationChars += msgChars(m);
    }
  }

  return {
    messages: out,
    report: {
      charsBefore: before,
      charsAfter: totalChars(out),
      prunedToolResults,
      prunedAssistantTexts,
      prunedDelegatedResults,
      remaining,
      policy: 'never: system prompt (core/authorization/security/completion/state sections), current task (first user message), user messages, last 4 messages; first: oldest tool results → marker; then: oldest assistant text → truncated',
    },
  };
}
