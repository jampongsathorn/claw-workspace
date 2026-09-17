/**
 * Permission modes (D5): read-only / auto / full.
 * read-only: only read-only tools may run.
 * auto: read-only auto; mutating tools prompt the user (interactive) or are
 *       denied (headless) unless --yes.
 * full: everything runs (isolated environments only).
 */
export type Mode = 'read-only' | 'auto' | 'full';

export interface ToolLike {
  name: string;
  readOnly: boolean;
}

export type PromptFn = (question: string) => Promise<'y' | 'n'>;

export class PermissionGate {
  constructor(
    public readonly mode: Mode,
    private readonly interactive: boolean,
    private readonly yes: boolean,
    private readonly promptFn?: PromptFn,
  ) {}

  async decide(tool: ToolLike, summary: string): Promise<{ allow: boolean; reason?: string }> {
    if (tool.readOnly) return { allow: true };
    if (this.mode === 'read-only')
      return { allow: false, reason: 'denied: read-only mode (tool would modify state)' };
    if (this.mode === 'full') return { allow: true };
    // auto
    if (this.yes) return { allow: true };
    if (!this.interactive || !this.promptFn)
      return { allow: false, reason: 'denied: headless auto mode requires --yes for mutating tools' };
    const a = await this.promptFn(`Allow ${tool.name}: ${summary}\n  [y/N] `);
    return a === 'y' ? { allow: true } : { allow: false, reason: 'denied by user' };
  }
}
