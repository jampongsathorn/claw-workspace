/**
 * OpenAI-compatible provider (chat/completions). Works with api.openai.com and
 * any compatible endpoint (OPENAI_BASE_URL). Upgrade path: Responses API with
 * prompt-caching + structured compaction (Codex pattern) — Phase 2.
 */
import type { CompleteParams, CompleteResult, Provider, ToolCall } from './types.js';
import { ProviderError } from './types.js';
import type { Usage } from '../core/events.js';

export class OpenAIProvider implements Provider {
  readonly id = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  ) {}

  private mapMessages(messages: CompleteParams['messages']): unknown[] {
    const out: unknown[] = [];
    for (const m of messages) {
      if (m.role === 'user') out.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls?.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        });
      } else {
        out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.output });
      }
    }
    return out;
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: params.model,
        messages: [{ role: 'system', content: params.system }, ...this.mapMessages(params.messages)],
        tools: params.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(`openai ${res.status}: ${body.slice(0, 500)}`, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const msg = data.choices[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    }));
    const usage: Usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cachedInputTokens: data.usage?.prompt_tokens_details?.cached_tokens,
    };
    return { text: msg?.content ?? '', toolCalls, usage };
  }
}
