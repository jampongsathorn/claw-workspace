# SKILL.md — Typed Sub-Agents

> Provides 6 typed sub-agents with role-based tool permissions, inspired by Claude Code's agent types.

## Overview

The **Typed Sub-Agents** plugin registers a single agent tool — `typed_subagent_spawn` — that wraps OpenClaw's native `sessions_spawn` with structured, named agent types. Each type carries a pre-defined tool permission boundary (allowlist and denylist), a purpose description, and sensible iteration/timeouts.

This gives you **enforced tool restrictions** and **semantic clarity** over raw `sessions_spawn` calls: instead of remembering which tools to allow/deny for a research agent, you just say `type: "explore"`.

---

## The 6 Agent Types

### 1. `explore` — Read-Only Research

| Property | Value |
|---|---|
| **Purpose** | Gather information without making any changes |
| **Tools Allowed** | `read`, `sessions_list`, `sessions_history`, `web_search`, `web_fetch`, `memory_search`, `memory_get` |
| **Tools Denied** | `exec`, `write`, `edit`, `browser`, `cron`, `process`, `nodes` |
| **Max Iterations** | 16 |
| **Default Timeout** | 300s |

**Use when:** You need to research a topic, summarize a codebase, check docs, or collect information from web searches without touching files or running commands.

---

### 2. `plan` — Strategic Thinking & Task Breakdown

| Property | Value |
|---|---|
| **Purpose** | Analyze requirements and create structured execution plans |
| **Tools Allowed** | `read`, `sessions_list`, `sessions_send`, `memory_search`, `memory_get` |
| **Tools Denied** | `exec`, `write`, `edit`, `browser`, `process`, `nodes` |
| **Max Iterations** | 8 |
| **Default Timeout** | 180s |

**Use when:** You want an agent to break down a complex task into steps, evaluate trade-offs, or think strategically before execution. Good for planning PR reviews, architecture decisions, or roadmap analysis.

---

### 3. `verification` — Testing & Code Review

| Property | Value |
|---|---|
| **Purpose** | Validate code correctness, run tests, review quality |
| **Tools Allowed** | `exec`, `read`, `process`, `sessions_list`, `sessions_history` |
| **Tools Denied** | `write`, `edit`, `browser`, `cron`, `nodes`, `canvas` |
| **Max Iterations** | 32 |
| **Default Timeout** | 600s |

**Use when:** Running test suites, linting, type-checking, or doing deep code review. Can execute shell commands but cannot write/edit files — so it won't auto-fix issues (use `general-purpose` for that).

---

### 4. `claw-guide` — Help & Onboarding

| Property | Value |
|---|---|
| **Purpose** | Guide users through OpenClaw features and answer questions |
| **Tools Allowed** | `read`, `sessions_list`, `sessions_history` |
| **Tools Denied** | `exec`, `write`, `edit`, `browser`, `cron`, `process`, `nodes` |
| **Max Iterations** | 4 |
| **Default Timeout** | 120s |

**Use when:** Onboarding a new user, answering feature questions, or providing interactive help. Completely read-only — cannot execute anything.

---

### 5. `statusline-setup` — UI & Config Setup

| Property | Value |
|---|---|
| **Purpose** | Configure statusline, themes, and user preferences |
| **Tools Allowed** | `read`, `write`, `edit` |
| **Tools Denied** | `exec`, `browser`, `cron`, `process`, `nodes`, `canvas` |
| **Max Iterations** | 8 |
| **Default Timeout** | 180s |

**Use when:** Editing configuration files, setting up statusline widgets, adjusting OpenClaw settings. Can read and write files but cannot run commands or use browser/process tools.

---

### 6. `general-purpose` — Default Fallback

| Property | Value |
|---|---|
| **Purpose** | Unconstrained agent for any task |
| **Tools Allowed** | (all standard tools) |
| **Tools Denied** | (none) |
| **Max Iterations** | 16 |
| **Default Timeout** | 300s |

**Use when:** You need a fully-capable sub-agent without restrictions. Falls back to OpenClaw's default tool set.

---

## Using `typed_subagent_spawn`

### Tool Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `task` | string | ✅ | The task description/instruction for the sub-agent |
| `type` | string | ✅ | Agent type: `explore`, `plan`, `verification`, `claw-guide`, `statusline-setup`, `general-purpose` |
| `label` | string | ❌ | Optional label for the sub-agent session (for tracking) |
| `model` | string | ❌ | Optional model override for the sub-agent |
| `runTimeoutSeconds` | number | ❌ | Optional timeout in seconds (overrides the type's default) |

### Examples

#### Spawn an Explore agent to research a topic

```
Use typed_subagent_spawn to research the latest developments in WebAssembly:
- type: "explore"
- task: "Research WebAssembly component model and WASI Preview2. Find 3-5 recent developments and summarize each in 2-3 sentences."
- label: "wasm-research"
```

#### Spawn a Plan agent to break down a complex task

```
Use typed_subagent_spawn to analyze this refactoring request:
- type: "plan"
- task: "Analyze this PR that moves the auth module from callbacks to async/await. Identify all call sites that need updating, estimate risk level for each, and propose an ordered migration plan."
- label: "auth-refactor-plan"
```

#### Spawn a Verification agent to run tests

```
Use typed_subagent_spawn to run the test suite:
- type: "verification"
- task: "Run the full test suite with coverage. Report which tests failed, the failure messages, and total coverage percentage."
- label: "test-run"
- runTimeoutSeconds: 300
```

#### Spawn a Claw-Guide agent to help a new user

```
Use typed_subagent_spawn to onboard a new user:
- type: "claw-guide"
- task: "Explain how to set up a custom agent in OpenClaw. Cover: (1) creating a new agent config, (2) assigning tools, (3) setting up channel bindings."
- label: "onboarding-help"
```

---

## How It Differs from Raw `sessions_spawn`

| Feature | `sessions_spawn` | `typed_subagent_spawn` |
|---|---|---|
| Tool restrictions | Manual — you specify allow/deny per call | Pre-defined per type — just pick a type |
| Semantic naming | "spawn with allow=[...]" | "spawn type=explore" |
| Defaults | None — everything is explicit | Sensible defaults per role |
| Iterations | Unlimited unless capped | Capped per type (e.g., 4 for claw-guide) |
| Tool documentation | You must remember which tools exist | Types are self-documenting with purposes |
| Type safety | Raw strings for tools | Named types reduce errors |

---

## Tool Restriction Enforcement

The tool restrictions are passed to the sub-agent via its **system prompt**. The sub-agent is instructed which tools it may and may not use, and tool calls outside the allowed set will fail at the agent level.

> **Note:** Restriction enforcement depends on the sub-agent model following system prompt instructions. For hard enforcement at the infrastructure level, configure `tools.subagents.tools` in your OpenClaw config.

---

## Customizing Agent Types

You can override or extend agent types via the plugin config in `openclaw.plugin.json` or via `plugins.entries.openclaw-typed-subagents.config` in your main config:

```json
{
  "plugins": {
    "entries": {
      "openclaw-typed-subagents": {
        "config": {
          "agentTypes": {
            "explore": {
              "description": "My custom explore description",
              "tools": {
                "allow": ["read", "web_search", "web_fetch"],
                "deny": ["exec", "write", "edit"]
              },
              "maxIterations": 10,
              "timeoutSeconds": 200
            }
          }
        }
      }
    }
  }
}
```

---

## Spawning via `sessions_spawn` Directly

If you need to call `sessions_spawn` directly with tool restrictions, the config equivalent is:

```json
{
  "tools": {
    "subagents": {
      "tools": {
        "allow": ["read", "web_search"],
        "deny": ["exec", "write"]
      }
    }
  }
}
```

But `typed_subagent_spawn` is easier because the types bundle purpose + tools + timeouts together.

---

## Architecture Notes

- Registered as a **required tool** (`optional: false`) — always available when the plugin is loaded.
- Uses `api.runtime.subagent.run()` internally with `deliver: true` for push-based auto-announce.
- Tool restrictions are communicated via system prompt, not infrastructure-level enforcement.
- Supports all standard `SpawnSubagentParams` fields via direct pass-through.
