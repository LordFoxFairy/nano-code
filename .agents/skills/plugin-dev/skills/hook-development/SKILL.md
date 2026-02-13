---
name: Hook Development
description: This skill should be used when the user asks to "create a hook", "add a PreToolUse/PostToolUse/Stop hook", "validate tool use", "implement prompt-based hooks", "set up event-driven automation", "block dangerous commands", or mentions hook events (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Notification). Provides comprehensive guidance for creating and implementing plugin hooks with focus on advanced prompt-based hooks API.
version: 1.0.0
---

# Hook Development for Plugins

## Overview

Hooks are event-driven automation scripts that execute in response to events. Use hooks to validate operations, enforce policies, add context, and integrate external tools into workflows.

**Key capabilities:**
- Validate tool calls before execution (PreToolUse)
- React to tool results (PostToolUse)
- Enforce completion standards (Stop, SubagentStop)
- Load project context (SessionStart)
- Automate workflows across the development lifecycle

## Hook Types

### Prompt-Based Hooks (Recommended)

Use LLM-driven decision making for context-aware validation:

```json
{
  "type": "prompt",
  "prompt": "Evaluate if this tool use is appropriate: $TOOL_INPUT",
  "timeout": 30
}
```

**Supported events:** Stop, SubagentStop, UserPromptSubmit, PreToolUse

**Benefits:**
- Context-aware decisions based on natural language reasoning
- Flexible evaluation logic without bash scripting
- Better edge case handling
- Easier to maintain and extend

### Command Hooks

Execute bash commands for deterministic checks:

```json
{
  "type": "command",
  "command": "bash ${PLUGIN_ROOT}/scripts/validate.sh",
  "timeout": 60
}
```

**Use for:**
- Fast deterministic validations
- File system operations
- External tool integrations
- Performance-critical checks

## Hook Configuration Format

**In `hooks/hooks.json`**:

```json
{
  "description": "Brief explanation of hooks (optional)",
  "hooks": {
    "PreToolUse": [...],
    "Stop": [...],
    "SessionStart": [...]
  }
}
```

## Hook Events

### PreToolUse

Execute before any tool runs. Use to approve, deny, or modify tool calls.

```json
{
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Validate file write safety. Check: system paths, credentials, path traversal, sensitive content. Return 'approve' or 'deny'."
        }
      ]
    }
  ]
}
```

### PostToolUse

Execute after tool completes. Use to react to results, provide feedback, or log.

### Stop

Execute when main agent considers stopping. Use to validate completeness.

```json
{
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Verify task completion: tests run, build succeeded, questions answered. Return 'approve' to stop or 'block' with reason to continue."
        }
      ]
    }
  ]
}
```

### SubagentStop

Execute when subagent considers stopping. Use to ensure subagent completed its task.

### UserPromptSubmit

Execute when user submits a prompt. Use to add context, validate, or block prompts.

### SessionStart

Execute when session begins. Use to load context and set environment.

```json
{
  "SessionStart": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "bash ${PLUGIN_ROOT}/scripts/load-context.sh"
        }
      ]
    }
  ]
}
```

### SessionEnd

Execute when session ends. Use for cleanup, logging, and state preservation.

### PreCompact

Execute before context compaction. Use to add critical information to preserve.

### Notification

Execute when notifications are sent. Use to react to notifications.

## Hook Output Format

### Standard Output (All Hooks)

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "Message for the agent"
}
```

### Exit Codes

- `0` - Success (stdout shown in transcript)
- `2` - Blocking error (stderr fed back to agent)
- Other - Non-blocking error

## Matchers

### Tool Name Matching

**Exact match:**
```json
"matcher": "Write"
```

**Multiple tools:**
```json
"matcher": "Read|Write|Edit"
```

**Wildcard (all tools):**
```json
"matcher": "*"
```

**Regex patterns:**
```json
"matcher": "mcp__.*__delete.*"
```

## Security Best Practices

### Input Validation

Always validate inputs in command hooks:

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')

# Validate tool name format
if [[ ! "$tool_name" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo '{"decision": "deny", "reason": "Invalid tool name"}' >&2
  exit 2
fi
```

### Path Safety

Check for path traversal and sensitive files:

```bash
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# Deny path traversal
if [[ "$file_path" == *".."* ]]; then
  echo '{"decision": "deny", "reason": "Path traversal detected"}' >&2
  exit 2
fi

# Deny sensitive files
if [[ "$file_path" == *".env"* ]]; then
  echo '{"decision": "deny", "reason": "Sensitive file"}' >&2
  exit 2
fi
```

## Best Practices

**DO:**
- Use prompt-based hooks for complex logic
- Use ${PLUGIN_ROOT} for portability
- Validate all inputs in command hooks
- Quote all bash variables
- Set appropriate timeouts
- Return structured JSON output
- Test hooks thoroughly

**DON'T:**
- Use hardcoded paths
- Trust user input without validation
- Create long-running hooks
- Rely on hook execution order
- Modify global state unpredictably
- Log sensitive information

## Quick Reference

### Hook Events Summary

| Event | When | Use For |
|-------|------|---------|
| PreToolUse | Before tool | Validation, modification |
| PostToolUse | After tool | Feedback, logging |
| UserPromptSubmit | User input | Context, validation |
| Stop | Agent stopping | Completeness check |
| SubagentStop | Subagent done | Task validation |
| SessionStart | Session begins | Context loading |
| SessionEnd | Session ends | Cleanup, logging |
| PreCompact | Before compact | Preserve context |
| Notification | Notification sent | Logging, reactions |

## Implementation Workflow

To implement hooks in a plugin:

1. Identify events to hook into (PreToolUse, Stop, SessionStart, etc.)
2. Decide between prompt-based (flexible) or command (deterministic) hooks
3. Write hook configuration in `hooks/hooks.json`
4. For command hooks, create hook scripts
5. Use ${PLUGIN_ROOT} for all file references
6. Test hooks before deployment
7. Document hooks in plugin README

Focus on prompt-based hooks for most use cases. Reserve command hooks for performance-critical or deterministic checks.
