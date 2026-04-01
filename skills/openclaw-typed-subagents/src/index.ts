import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Agent type definitions
// ---------------------------------------------------------------------------

export type AgentTypeId =
  | "explore"
  | "plan"
  | "verification"
  | "claw-guide"
  | "statusline-setup"
  | "general-purpose";

export interface AgentTypeConfig {
  description: string;
  tools: {
    allow?: string[];
    deny?: string[];
  };
  maxIterations: number;
  timeoutSeconds: number;
}

// ---------------------------------------------------------------------------
// Default agent type registry
// ---------------------------------------------------------------------------

export const DEFAULT_AGENT_TYPES: Record<AgentTypeId, AgentTypeConfig> = {
  explore: {
    description:
      "Read-only research and exploration. Gathers information without making changes.",
    tools: {
      allow: [
        "read",
        "sessions_list",
        "sessions_history",
        "web_search",
        "web_fetch",
        "memory_search",
        "memory_get",
      ],
      deny: [
        "exec",
        "write",
        "edit",
        "browser",
        "cron",
        "process",
        "nodes",
      ],
    },
    maxIterations: 16,
    timeoutSeconds: 300,
  },

  plan: {
    description:
      "Strategic thinking and task breakdown. Analyzes requirements and creates execution plans.",
    tools: {
      allow: [
        "read",
        "sessions_list",
        "sessions_send",
        "memory_search",
        "memory_get",
      ],
      deny: [
        "exec",
        "write",
        "edit",
        "browser",
        "process",
        "nodes",
      ],
    },
    maxIterations: 8,
    timeoutSeconds: 180,
  },

  verification: {
    description:
      "Testing and code review. Validates code correctness and quality.",
    tools: {
      allow: [
        "exec",
        "read",
        "process",
        "sessions_list",
        "sessions_history",
      ],
      deny: [
        "write",
        "edit",
        "browser",
        "cron",
        "nodes",
        "canvas",
      ],
    },
    maxIterations: 32,
    timeoutSeconds: 600,
  },

  "claw-guide": {
    description:
      "Help and onboarding assistant. Guides users through OpenClaw features.",
    tools: {
      allow: ["read", "sessions_list", "sessions_history"],
      deny: [
        "exec",
        "write",
        "edit",
        "browser",
        "cron",
        "process",
        "nodes",
      ],
    },
    maxIterations: 4,
    timeoutSeconds: 120,
  },

  "statusline-setup": {
    description:
      "UI and configuration setup. Handles statusline and preference configuration.",
    tools: {
      allow: ["read", "write", "edit"],
      deny: [
        "exec",
        "browser",
        "cron",
        "process",
        "nodes",
        "canvas",
      ],
    },
    maxIterations: 8,
    timeoutSeconds: 180,
  },

  "general-purpose": {
    description:
      "Default fallback agent. Has access to all standard tools without restrictions.",
    tools: {
      allow: [],
      deny: [],
    },
    maxIterations: 16,
    timeoutSeconds: 300,
  },
};

// ---------------------------------------------------------------------------
// Tool parameter schema
// ---------------------------------------------------------------------------

const TypedSubagentSpawnSchema = Type.Object({
  task: Type.String({
    description:
      "The task description or instruction for the sub-agent to perform",
  }),
  type: Type.String({
    description: `Agent type: ${(
      Object.keys(DEFAULT_AGENT_TYPES) as AgentTypeId[]
    ).join(", ")}`,
  }),
  label: Type.Optional(
    Type.String({ description: "Optional label for the sub-agent session" })
  ),
  model: Type.Optional(
    Type.String({ description: "Optional model override for the sub-agent" })
  ),
  runTimeoutSeconds: Type.Optional(
    Type.Number({
      description: "Optional timeout in seconds for the sub-agent run",
      minimum: 0,
    })
  ),
});

// ---------------------------------------------------------------------------
// Build system-prompt snippet describing allowed/denied tools
// ---------------------------------------------------------------------------

function buildToolInstruction(typeConfig: AgentTypeConfig): string {
  const lines: string[] = [];

  if (typeConfig.tools.allow.length > 0) {
    lines.push(
      `You may ONLY use these tools: ${typeConfig.tools.allow.join(", ")}.`
    );
  }

  if (typeConfig.tools.deny.length > 0) {
    lines.push(
      `Do NOT use these tools under any circumstances: ${typeConfig.tools.deny.join(", ")}.`
    );
  }

  if (lines.length === 0) {
    lines.push(
      "You have access to all standard tools. Use your best judgment."
    );
  }

  lines.push(
    `If you attempt to call a tool that is not in your allowed list, the tool will fail with an access-denied error.`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build the full system prompt for the typed sub-agent
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  agentType: AgentTypeId,
  typeConfig: AgentTypeConfig
): string {
  return `You are a ${agentType} sub-agent.

Role: ${typeConfig.description}

${buildToolInstruction(typeConfig)}

Complete the assigned task carefully. When finished, your results will be announced back to the parent agent automatically.`;
}

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export default definePluginEntry({
  id: "openclaw-typed-subagents",
  name: "Typed Sub-Agents",
  description:
    "Provides 6 typed sub-agents with role-based tool permissions, inspired by Claude Code's agent types",
  configSchema: {
    // Schema is defined in openclaw.plugin.json; empty here because the
    // manifest configSchema is used at load time.
  },

  register(api) {
    api.registerTool(
      {
        name: "typed_subagent_spawn",
        description:
          "Spawn a typed sub-agent with role-based tool permissions. " +
          "Each type restricts which tools the sub-agent can use. " +
          "Use this instead of raw sessions_spawn when you need enforced tool boundaries.",
        parameters: TypedSubagentSpawnSchema,

        async execute(_toolCallId, params) {
          const rawType = String(params.type).trim().toLowerCase() as AgentTypeId;

          // Validate agent type
          if (!DEFAULT_AGENT_TYPES[rawType]) {
            const validTypes = Object.keys(DEFAULT_AGENT_TYPES).join(", ");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Invalid agent type "${rawType}". Valid types are: ${validTypes}`,
                },
              ],
            };
          }

          const agentType = rawType;
          const typeConfig = DEFAULT_AGENT_TYPES[agentType];

          // Merge plugin config with defaults (plugin config takes precedence)
          const pluginAgentTypes = (
            api.pluginConfig?.agentTypes as
              | Record<string, Partial<AgentTypeConfig>>
              | undefined
          ) ?? {};

          const customConfig = pluginAgentTypes[agentType];
          const mergedConfig: AgentTypeConfig = customConfig
            ? {
                description: customConfig.description ?? typeConfig.description,
                tools: {
                  allow: customConfig.tools?.allow ?? typeConfig.tools.allow,
                  deny: customConfig.tools?.deny ?? typeConfig.tools.deny,
                },
                maxIterations:
                  customConfig.maxIterations ?? typeConfig.maxIterations,
                timeoutSeconds:
                  customConfig.timeoutSeconds ?? typeConfig.timeoutSeconds,
              }
            : typeConfig;

          const task = String(params.task);
          const label = params.label ? String(params.label) : undefined;
          const model = params.model ? String(params.model) : undefined;
          const runTimeoutSeconds =
            typeof params.runTimeoutSeconds === "number"
              ? params.runTimeoutSeconds
              : mergedConfig.timeoutSeconds;

          const systemPrompt = buildSystemPrompt(agentType, mergedConfig);

          // Build the message that will be sent to the sub-agent
          // Include the task and system-level instructions
          const subagentMessage = `${systemPrompt}

---

TASK:
${task}`;

          // Determine the parent session key for spawning
          const parentSessionKey =
            api.runtime.agent?.sessionKey ??
            `agent:main:${api.id}:${_toolCallId}`;

          try {
            // Use api.runtime.subagent.run() to spawn the sub-agent
            const result = await api.runtime.subagent.run({
              sessionKey: parentSessionKey,
              message: subagentMessage,
              model: model,
              deliver: true, // Push-based: sub-agent announces back when done
            });

            const runId = result.runId;

            // Build response text describing what was spawned
            const toolAllowList =
              mergedConfig.tools.allow.length > 0
                ? mergedConfig.tools.allow.join(", ")
                : "(all tools allowed)";
            const toolDenyList =
              mergedConfig.tools.deny.length > 0
                ? mergedConfig.tools.deny.join(", ")
                : "(no tools denied)";

            const responseText = [
              `Sub-agent spawned successfully.`,
              ``,
              `  Type:         ${agentType}`,
              `  Label:        ${label ?? "(none)"}`,
              `  Run ID:       ${runId}`,
              `  Model:        ${model ?? "(default)"}`,
              `  Timeout:      ${runTimeoutSeconds}s`,
              ``,
              `  Tools allowed: ${toolAllowList}`,
              `  Tools denied:  ${toolDenyList}`,
              ``,
              `The sub-agent will announce its results automatically when complete.`,
            ].join("\n");

            return {
              content: [{ type: "text" as const, text: responseText }],
            };
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to spawn sub-agent: ${errorMessage}`,
                },
              ],
            };
          }
        },
      },
      { optional: false }
    );

    api.logger.info(
      `[openclaw-typed-subagents] Registered typed_subagent_spawn tool with ${Object.keys(DEFAULT_AGENT_TYPES).length} agent types`
    );
  },
});
