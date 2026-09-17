/** Model-agnostic provider interface (Hermes-style adapter layer). */
import type { Usage } from '../core/events.js';

export type JsonSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type ProviderMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; output: string; isError?: boolean };

export interface CompleteParams {
  model: string;
  system: string;
  messages: ProviderMessage[];
  tools: ToolSpec[];
}

export interface CompleteResult {
  text: string;
  thoughts?: string;
  toolCalls: ToolCall[];
  usage: Usage;
}

export interface Provider {
  readonly id: string;
  complete(params: CompleteParams): Promise<CompleteResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
