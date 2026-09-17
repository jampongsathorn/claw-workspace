/**
 * Anthropic Messages API provider.
 * Anthropic requires strict user/assistant alternation and tool results inside
 * user messages — normalizeMessages() enforces that.
 */
import type { CompleteParams, CompleteResult, Provider, ToolCall } from './types.js';
import { ProviderError } from './types.js';
import type { Usage } from '../core/events.js';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  ) {}

  private normalize(messages: CompleteParams['messages']): { role: 'user' | 'assistant'; content: Block[] }[] {
    const out: { role: 'user' | 'assistant'; content: Block[] }[] = [];
    const push = (role: 'user' | 'assistant', blocks: Block[]) => {
      if (blocks.length === 0) return;
      const last = out[out.length - 1];
      if (last && last.role === role) last.content.push(...blocks);
      else out.push({ role, content: blocks });
    };
    for (const m of messages) {
      if (m.role === 'user') push('user', [{ type: 'text', text: m.content }]);
      else if (m.role === 'assistant') {
        const blocks: Block[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        push('assistant', blocks);
      } else {
        push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.output, is_error: m.isError }]);
      }
    }
    if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
    return out;
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: 8192,
        system: params.system,
        messages: this.normalize(params.messages),
        tools: params.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(`anthropic ${res.status}: ${body.slice(0, 500)}`, res.status === 429 || res.status >= 500);
    }
    const data = (await res.json()) as {
      content: Block[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    };
    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const b of data.content) {
      if (b.type === 'text') text += b.text;
      else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, input: b.input as Record<string, unknown> });
    }
    const usage: Usage = {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cachedInputTokens: data.usage?.cache_read_input_tokens,
    };
    return { text, toolCalls, usage };
  }
}
