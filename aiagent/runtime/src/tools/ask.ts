import type { Tool } from './registry.js';

export function makeAskTool(): Tool {
  return {
    name: 'ask',
    description:
      'Ask the user a question when a consequential decision is genuinely ambiguous. ' +
      'Prefer multiple choice; bundle related questions. Elapsed time is not an answer or approval.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
      },
      required: ['question'],
    },
    readOnly: true,
    async execute(input, ctx) {
      const q = String(input.question);
      const opts = (input.options as string[] | undefined) ?? [];
      const answer = await ctx.ask(opts.length ? `${q}\n${opts.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}` : q);
      return { ok: true, output: answer };
    },
  };
}
