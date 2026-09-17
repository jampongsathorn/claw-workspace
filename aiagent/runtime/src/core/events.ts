/** Typed agent event stream — the loop's public API (Gemini-CLI-style union). */
import type { GateVerdict } from './completion.js';
import type { FailureClass, RetryReason } from './recovery.js';

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
};

export type AgentEvent =
  | {
      type: 'init';
      sessionId: string;
      model: string;
      provider: string;
      promptVersion: string;
      stableHash: string;
      platform: string;
      surface: string;
    }
  | { type: 'turn'; n: number }
  | { type: 'assistant_text'; text: string }
  | { type: 'assistant_thought'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; output: string
      /** Phase 2C: structured failure evidence (machine-classified; failures only). */
      failure?: {
        classification: FailureClass;
        retryable: boolean;
        attempt: number;
        retriesUsed: number;
        exitCode?: number | null;
      };
      /** Phase 2G: machine-readable execution evidence (exec tool; reconstructs what happened). */
      exec?: import('../tools/exec.js').ExecEvidence;
    }
  | { type: 'error'; message: string; retryable: boolean }
  | { type: 'loop_detected'; tool: string; repeats: number }
  /** Phase 2C: harness auto-retrying the same action (bounded by RecoveryBudget). */
  | {
      type: 'retry';
      tool: string;
      id: string;
      attempt: number;
      classification: FailureClass;
      retriesUsed: number;
      totalRetriesUsed: number;
    }
  /** Phase 2E: agent definitions discovered (metadata only — no full agent prompt). */
  | { type: 'agent_discovered'; count: number; agents: { name: string; purpose: string }[] }
  /** Phase 2E: model selected an agent for delegation. */
  | { type: 'agent_selected'; agent: string; task: string; rerunReason?: string }
  /** Phase 2E: isolated child execution context created. */
  | {
      type: 'agent_spawned';
      agent: string;
      agentId: string;
      parentSessionId: string;
      childSessionId: string;
      /** Phase 2F: inspectable child state location (session home; child scratch lives inside). */
      childHome?: string;
      rerunOf?: string;
      rerunReason?: string;
    }
  /** Phase 2E: child run started. */
  | { type: 'agent_started'; agent: string; agentId: string; childSessionId: string }
  /** Phase 2E: terminal structured child result (unverified delegated output). */
  | {
      type: 'agent_result';
      agent: string;
      agentId: string;
      childSessionId: string;
      status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'NEEDS_INPUT';
      turns: number;
      toolCalls: Record<string, number>;
      denials: number;
      retries: number;
      error?: string;
      result: string;
      reasons: string[];
    }
  /** Phase 2E: child terminal failure (reason preserved). */
  | { type: 'agent_failed'; agent: string; agentId: string; childSessionId: string; reason: string }
  /** Phase 2E: child hit a capability/permission boundary. */
  | { type: 'agent_blocked'; agent: string; agentId: string; childSessionId: string; reason: string }
  /** Phase 2E: child needs user input — parent must not convert this to SUCCESS. */
  | { type: 'agent_needs_input'; agent: string; agentId: string; childSessionId: string; reason: string }
  /** Phase 2E: delegation lifecycle closed. agent_completed ≠ task_completed. */
  | {
      type: 'agent_completed';
      agent: string;
      agentId: string;
      childSessionId: string;
      status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'NEEDS_INPUT';
      rerunOf?: string;
      rerunReason?: string;
    }
  /** Phase 2F: explicit state read (id/counts only — NEVER state content). */
  | { type: 'state_read'; store: 'memory' | 'notes' | 'scratch'; id?: string; count?: number }
  /** Phase 2F: explicit state write into one store (no content; provenance label). */
  | { type: 'state_written'; store: 'memory' | 'notes' | 'scratch'; id?: string; bytes?: number; source?: string }
  /** Phase 2F: harness-VERIFIED explicit promotion (content matched the referenced source). */
  | { type: 'state_promoted'; from: 'memory' | 'notes' | 'scratch'; to: 'memory' | 'notes' | 'scratch'; id?: string; reason: string }
  /** Phase 2F: explicit state deletion/clearing. */
  | { type: 'state_cleared'; store: 'memory' | 'notes' | 'scratch'; id?: string }
  /** Phase 2F: context reconstructed at resume (which state sections were re-injected). */
  | { type: 'context_rebuilt'; sessionId: string; notes: number; memoryEntries: number; sections: string[] }
  /**
   * Phase 2F: request context pruned to the deterministic budget.
   * Never pruned: system prompt (core/authorization/security/completion/state
   * sections), the current task, user messages, the active exchange.
   */
  | {
      type: 'context_pruned';
      systemChars: number;
      charsBefore: number;
      charsAfter: number;
      prunedToolResults: number;
      prunedAssistantTexts: number;
      prunedDelegatedResults: number;
      remaining: { conversationChars: number; toolOutputChars: number; delegatedChars: number };
      policy: string;
    }
  /** Phase 2D: skill catalog discovered (progressive disclosure: names + descriptions only). */
  | { type: 'skill_discovered'; count: number; skills: string[] }
  /** Phase 2D: model selected a skill for loading. */
  | { type: 'skill_selected'; name: string }
  /** Phase 2D: skill content loaded from disk (hash makes staleness machine-detectable). */
  | { type: 'skill_loaded'; name: string; path: string; contentHash: string; chars: number }
  /** Phase 2D: skill load failed — no fabricated content, no silent substitution. */
  | { type: 'skill_load_failed'; name: string; reason: 'not_found' | 'read_error' }
  /** Phase 2C: retry budget exhausted for a retryable failure — evidence hands back to the model. */
  | {
      type: 'recovery_exhausted';
      tool: string;
      id: string;
      classification: FailureClass;
      reason: RetryReason;
      retriesUsed: number;
      totalRetriesUsed: number;
    }
  | { type: 'max_turns'; turns: number }
  | {
      type: 'done';
      turns: number;
      usage: Usage;
      error?: string;
      completion?: GateVerdict;
    };

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0),
  };
}
