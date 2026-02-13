---
name: plugin-dev
description: This skill should be used when the user asks to "create a plugin", "develop a plugin", "build a plugin", "add plugin components", "create hooks", "add MCP server", "create slash command", "create an agent", "create a skill", "plugin structure", "plugin.json manifest", or needs guidance on plugin development, hooks API, MCP integration, command development, agent development, or skill creation best practices.
version: 1.0.0
---

# Plugin Development Toolkit

A comprehensive toolkit for developing deepagents plugins with expert guidance on hooks, MCP integration, plugin structure, and component development.

## Overview

This toolkit provides seven specialized skills to help build high-quality plugins:

1. **Hook Development** - Advanced hooks API and event-driven automation
2. **MCP Integration** - Model Context Protocol server integration
3. **Plugin Structure** - Plugin organization and manifest configuration
4. **Plugin Settings** - Configuration patterns using .local.md files
5. **Command Development** - Creating slash commands with frontmatter and arguments
6. **Agent Development** - Creating autonomous agents with AI-assisted generation
7. **Skill Development** - Creating skills with progressive disclosure and strong triggers

Each skill follows best practices with progressive disclosure: lean core documentation, detailed references, working examples, and utility scripts.

## Available Commands

### /plugin-dev:create-plugin

A comprehensive, end-to-end workflow command for creating plugins from scratch.

**8-Phase Process:**
1. **Discovery** - Understand plugin purpose and requirements
2. **Component Planning** - Determine needed skills, commands, agents, hooks, MCP
3. **Detailed Design** - Specify each component and resolve ambiguities
4. **Structure Creation** - Set up directories and manifest
5. **Component Implementation** - Create each component
6. **Validation** - Run validators and component-specific checks
7. **Testing** - Verify plugin works correctly
8. **Documentation** - Finalize README and prepare for distribution

## Available Agents

### agent-creator
Creates autonomous agents with AI-assisted generation. Use when asked to "create an agent", "generate an agent", "build a new agent".

### plugin-validator
Validates plugin structure, configuration, and components. Use for "validate my plugin", "check plugin structure", "verify plugin is correct".

### skill-reviewer
Reviews skill quality and provides improvement recommendations. Use when "review my skill", "check skill quality", "improve skill description".

## Skills Reference

### 1. Hook Development

**Trigger phrases:** "create a hook", "add a PreToolUse hook", "validate tool use", "implement prompt-based hooks", "block dangerous commands"

**What it covers:**
- Prompt-based hooks (recommended) with LLM decision-making
- Command hooks for deterministic validation
- All hook events: PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Notification
- Hook output formats and JSON schemas
- Security best practices and input validation

### 2. MCP Integration

**Trigger phrases:** "add MCP server", "integrate MCP", "configure .mcp.json", "Model Context Protocol", "connect external service"

**What it covers:**
- MCP server configuration (.mcp.json vs plugin manifest)
- All server types: stdio (local), SSE (hosted/OAuth), HTTP (REST), WebSocket (real-time)
- Environment variable expansion
- MCP tool naming and usage in commands/agents
- Authentication patterns: OAuth, tokens, env vars

### 3. Plugin Structure

**Trigger phrases:** "plugin structure", "plugin manifest", "auto-discovery", "component organization", "plugin directory layout"

**What it covers:**
- Standard plugin directory structure and auto-discovery
- Plugin manifest format and all fields
- Component organization (commands, agents, skills, hooks)
- File naming conventions and best practices

### 4. Plugin Settings

**Trigger phrases:** "plugin settings", "store plugin configuration", ".local.md files", "plugin state files", "read YAML frontmatter"

**What it covers:**
- .local.md pattern for configuration
- YAML frontmatter + markdown body structure
- Parsing techniques for bash scripts
- Temporarily active hooks (flag files)

### 5. Command Development

**Trigger phrases:** "create a slash command", "add a command", "command frontmatter", "define command arguments"

**What it covers:**
- Slash command structure and markdown format
- YAML frontmatter fields (description, argument-hint, allowed-tools)
- Dynamic arguments and file references
- Bash execution for context

### 6. Agent Development

**Trigger phrases:** "create an agent", "add an agent", "write a subagent", "agent frontmatter", "autonomous agent"

**What it covers:**
- Agent file structure (YAML frontmatter + system prompt)
- All frontmatter fields (name, description, model, color, tools)
- Description format with example blocks for reliable triggering
- System prompt design patterns

### 7. Skill Development

**Trigger phrases:** "create a skill", "add a skill", "write a new skill", "improve skill description", "organize skill content"

**What it covers:**
- Skill structure (SKILL.md with YAML frontmatter)
- Progressive disclosure principle (metadata -> SKILL.md -> resources)
- Strong trigger descriptions with specific phrases
- Writing style (imperative/infinitive form, third person)

## Plugin Development Workflow

```
+-----------------------+
|   Design Structure    |  -> plugin-structure skill
|  (manifest, layout)   |
+-----------+-----------+
            |
+-----------v-----------+
|   Add Components      |
|  (commands, agents,   |  -> All skills provide guidance
|   skills, hooks)      |
+-----------+-----------+
            |
+-----------v-----------+
|  Integrate Services   |  -> mcp-integration skill
|  (MCP servers)        |
+-----------+-----------+
            |
+-----------v-----------+
|   Add Automation      |  -> hook-development skill
|  (hooks, validation)  |
+-----------+-----------+
            |
+-----------v-----------+
|  Test & Validate      |  -> Use plugin-validator agent
+-----------------------+
```

## Best Practices

### Security First
- Input validation in hooks
- HTTPS/WSS for MCP servers
- Environment variables for credentials
- Principle of least privilege

### Portability
- Use ${PLUGIN_ROOT} everywhere
- Relative paths only
- Environment variable substitution

### Testing
- Validate configurations before deployment
- Test hooks with sample inputs
- Use debug mode for detailed logs

### Documentation
- Clear README files
- Documented environment variables
- Usage examples

## Directory Structure

```
plugin-name/
+-- plugin.json          # Required: Plugin manifest
+-- commands/            # Slash commands (.md files)
+-- agents/              # Subagent definitions (.md files)
+-- skills/              # Agent skills (subdirectories)
|   +-- skill-name/
|       +-- SKILL.md     # Required for each skill
+-- hooks/
|   +-- hooks.json       # Event handler configuration
+-- .mcp.json            # MCP server definitions
+-- scripts/             # Helper scripts and utilities
```

## Quick Start

### Creating Your First Plugin

1. **Plan your plugin structure:**
   - Ask: "What's the best directory structure for a plugin with commands and MCP integration?"
   - The plugin-structure skill will guide you

2. **Add MCP integration (if needed):**
   - Ask: "How do I add an MCP server for database access?"
   - The mcp-integration skill provides examples and patterns

3. **Implement hooks (if needed):**
   - Ask: "Create a PreToolUse hook that validates file writes"
   - The hook-development skill gives working examples

## Component Documentation

For detailed documentation on each component type, refer to the skills subdirectories:

- `skills/hook-development/SKILL.md`
- `skills/mcp-integration/SKILL.md`
- `skills/plugin-structure/SKILL.md`
- `skills/plugin-settings/SKILL.md`
- `skills/command-development/SKILL.md`
- `skills/agent-development/SKILL.md`
- `skills/skill-development/SKILL.md`

## Agent Documentation

See `agents/` directory for agent specifications:
- `agents/agent-creator.md`
- `agents/plugin-validator.md`
- `agents/skill-reviewer.md`

## Command Reference

See `commands/create-plugin.md` for the full plugin creation workflow command.
