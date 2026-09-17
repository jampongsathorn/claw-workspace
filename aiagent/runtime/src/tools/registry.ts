import type { ToolSpec } from '../providers/types.js';

export interface ToolContext {
  cwd: string;
  /** Phase 2F: session-LOCAL scratch dir (was shared per-cwd before 2F). */
  scratchpad: string;
  todo: () => import('../core/session.js').TodoItem[];
  setTodo: (t: import('../core/session.js').TodoItem[]) => Promise<void>;
  ask: (q: string) => Promise<string>;
  /** Phase 2F: live accessor for the current session's note texts (promotion verification). */
  notesLines?: () => string[];
  /** Phase 2F: the run's PermissionGate — state tools route mutating ops through it. */
  gate?: import('../core/permissions.js').PermissionGate;
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolSpec['parameters'];
  readOnly: boolean;
  /**
   * `output` is always present. `exitCode`/`stdout`/`stderr` are additive,
   * machine-structured evidence (exec provides them); Phase 1 tools may omit.
   */
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<{
    ok: boolean;
    output: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    /** Phase 2G: machine-readable execution evidence (exec tool only). */
    exec?: import('./exec.js').ExecEvidence;
    /** Phase 2D: skill-lifecycle stages observed by this tool call (skill tool only). */
    skillEvents?: import('./skill.js').SkillStage[];
    /** Phase 2E: agent-delegation lifecycle stages observed by this tool call (agent tool only). */
    agentEvents?: import('./agent.js').AgentStage[];
    /** Phase 2F: state-operation stages observed by this tool call (state tools only; never carry content). */
    stateEvents?: import('./state.js').StateStage[];
  }>;
}

export class Registry {
  private tools = new Map<string, Tool>();
  register(t: Tool): void {
    this.tools.set(t.name, t);
  }
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  list(): Tool[] {
    return [...this.tools.values()];
  }
  specs(): ToolSpec[] {
    return this.list().map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }
}

export function truncateOutput(out: string, max = 30000): { output: string; truncated: boolean } {
  if (out.length <= max) return { output: out, truncated: false };
  const head = out.slice(0, max - 2000);
  const tail = out.slice(-1500);
  return {
    output: head + `\n…[truncated ${out.length - max} chars]…\n` + tail,
    truncated: true,
  };
}
