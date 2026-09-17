import type { Provider } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

export type ProviderId = 'openai' | 'anthropic';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: process.env.AIAGENT_MODEL ?? 'gpt-5.6',
  anthropic: process.env.AIAGENT_MODEL ?? 'claude-sonnet-5',
};

export function createProvider(id: ProviderId): Provider {
  if (id === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    return new OpenAIProvider(key);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new AnthropicProvider(key);
}

export * from './types.js';
