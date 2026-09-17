import type { Tool } from './registry.js';

export function makeTodoTool(): Tool {
  return {
    name: 'todo',
    description:
      'Create or replace the todo list for multi-step work (3+ steps). Keep it current; a plan is a promise.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
            },
            required: ['text', 'status'],
          },
        },
      },
      required: ['items'],
    },
    readOnly: true,
    async execute(input, ctx) {
      const items = (input.items as { text: string; status: string }[]).map((i) => ({
        text: String(i.text),
        status: (['pending', 'in_progress', 'done'].includes(i.status) ? i.status : 'pending') as
          | 'pending'
          | 'in_progress'
          | 'done',
      }));
      await ctx.setTodo(items);
      const icon = { pending: ' ', in_progress: '→', done: '✓' } as const;
      return { ok: true, output: items.map((i) => `[${icon[i.status]}] ${i.text}`).join('\n') || '(empty list)' };
    },
  };
}
