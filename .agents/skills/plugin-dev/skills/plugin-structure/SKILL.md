---
name: Plugin Structure
description: This skill should be used when the user asks to "create a plugin", "scaffold a plugin", "understand plugin structure", "organize plugin components", "set up plugin manifest", "add commands/agents/skills/hooks", "configure auto-discovery", or needs guidance on plugin directory layout, manifest configuration, component organization, file naming conventions, or plugin architecture best practices.
version: 1.0.0
---

# Plugin Structure

## Overview

Plugins follow a standardized directory structure with automatic component discovery. Understanding this structure enables creating well-organized, maintainable plugins that integrate seamlessly.

**Key concepts:**
- Conventional directory layout for automatic discovery
- Manifest-driven configuration in `plugin.json`
- Component-based organization (commands, agents, skills, hooks)
- Portable path references using `${PLUGIN_ROOT}`
- Explicit vs. auto-discovered component loading

## Directory Structure

Every plugin follows this organizational pattern:

```
plugin-name/
+-- plugin.json              # Required: Plugin manifest
+-- commands/                # Slash commands (.md files)
+-- agents/                  # Subagent definitions (.md files)
+-- skills/                  # Agent skills (subdirectories)
|   +-- skill-name/
|       +-- SKILL.md         # Required for each skill
+-- hooks/
|   +-- hooks.json           # Event handler configuration
+-- .mcp.json                # MCP server definitions
+-- scripts/                 # Helper scripts and utilities
```

**Critical rules:**

1. **Manifest location**: The `plugin.json` manifest MUST be at plugin root
2. **Component locations**: All component directories at plugin root level
3. **Optional components**: Only create directories for components the plugin actually uses
4. **Naming convention**: Use kebab-case for all directory and file names

## Plugin Manifest (plugin.json)

The manifest defines plugin metadata and configuration.

### Required Fields

```json
{
  "name": "plugin-name"
}
```

**Name requirements:**
- Use kebab-case format (lowercase with hyphens)
- Must be unique across installed plugins
- No spaces or special characters

### Recommended Metadata

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Brief explanation of plugin purpose",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "homepage": "https://docs.example.com",
  "repository": "https://github.com/user/plugin-name",
  "license": "MIT",
  "keywords": ["testing", "automation"]
}
```

## Component Organization

### Commands

**Location**: `commands/` directory
**Format**: Markdown files with YAML frontmatter
**Auto-discovery**: All `.md` files in `commands/` load automatically

**Example structure**:
```
commands/
+-- review.md        # /review command
+-- test.md          # /test command
+-- deploy.md        # /deploy command
```

### Agents

**Location**: `agents/` directory
**Format**: Markdown files with YAML frontmatter
**Auto-discovery**: All `.md` files in `agents/` load automatically

**Example structure**:
```
agents/
+-- code-reviewer.md
+-- test-generator.md
+-- refactorer.md
```

### Skills

**Location**: `skills/` directory with subdirectories per skill
**Format**: Each skill in its own directory with `SKILL.md` file
**Auto-discovery**: All `SKILL.md` files in skill subdirectories load automatically

**Example structure**:
```
skills/
+-- api-testing/
|   +-- SKILL.md
|   +-- scripts/
|   +-- references/
+-- database-migrations/
    +-- SKILL.md
    +-- examples/
```

### Hooks

**Location**: `hooks/hooks.json` or inline in `plugin.json`
**Format**: JSON configuration defining event handlers
**Registration**: Hooks register automatically when plugin enables

**Example structure**:
```
hooks/
+-- hooks.json           # Hook configuration
+-- scripts/
    +-- validate.sh      # Hook script
    +-- check-style.sh   # Hook script
```

### MCP Servers

**Location**: `.mcp.json` at plugin root or inline in `plugin.json`
**Format**: JSON configuration for MCP server definitions
**Auto-start**: Servers start automatically when plugin enables

## Portable Path References

### ${PLUGIN_ROOT}

Use `${PLUGIN_ROOT}` environment variable for all intra-plugin path references:

```json
{
  "command": "bash ${PLUGIN_ROOT}/scripts/run.sh"
}
```

**Where to use it**:
- Hook command paths
- MCP server command arguments
- Script execution references
- Resource file paths

**Never use**:
- Hardcoded absolute paths
- Relative paths from working directory
- Home directory shortcuts

## File Naming Conventions

### Component Files

**Commands**: Use kebab-case `.md` files
- `code-review.md` -> `/code-review`
- `run-tests.md` -> `/run-tests`

**Agents**: Use kebab-case `.md` files describing role
- `test-generator.md`
- `code-reviewer.md`

**Skills**: Use kebab-case directory names
- `api-testing/`
- `database-migrations/`

### Supporting Files

**Scripts**: Use descriptive kebab-case names with appropriate extensions
- `validate-input.sh`
- `generate-report.py`

**Documentation**: Use kebab-case markdown files
- `api-reference.md`
- `migration-guide.md`

## Auto-Discovery Mechanism

Components are discovered and loaded automatically:

1. **Plugin manifest**: Reads `plugin.json` when plugin enables
2. **Commands**: Scans `commands/` directory for `.md` files
3. **Agents**: Scans `agents/` directory for `.md` files
4. **Skills**: Scans `skills/` for subdirectories containing `SKILL.md`
5. **Hooks**: Loads configuration from `hooks/hooks.json` or manifest
6. **MCP servers**: Loads configuration from `.mcp.json` or manifest

## Best Practices

### Organization

1. **Logical grouping**: Group related components together
2. **Minimal manifest**: Keep `plugin.json` lean
3. **Documentation**: Include README files

### Naming

1. **Consistency**: Use consistent naming across components
2. **Clarity**: Use descriptive names that indicate purpose
3. **Length**: Balance brevity with clarity

### Portability

1. **Always use ${PLUGIN_ROOT}**: Never hardcode paths
2. **Test on multiple systems**: Verify cross-platform
3. **Document dependencies**: List required tools and versions
4. **Avoid system-specific features**: Use portable constructs

## Common Patterns

### Minimal Plugin

Single command with no dependencies:
```
my-plugin/
+-- plugin.json    # Just name field
+-- commands/
    +-- hello.md   # Single command
```

### Full-Featured Plugin

Complete plugin with all component types:
```
my-plugin/
+-- plugin.json
+-- commands/          # User-facing commands
+-- agents/            # Specialized subagents
+-- skills/            # Auto-activating skills
+-- hooks/             # Event handlers
|   +-- hooks.json
|   +-- scripts/
+-- .mcp.json          # External integrations
+-- scripts/           # Shared utilities
```

### Skill-Focused Plugin

Plugin providing only skills:
```
my-plugin/
+-- plugin.json
+-- skills/
    +-- skill-one/
    |   +-- SKILL.md
    +-- skill-two/
        +-- SKILL.md
```

## Troubleshooting

**Component not loading**:
- Verify file is in correct directory with correct extension
- Check YAML frontmatter syntax
- Ensure skill has `SKILL.md` (not `README.md`)
- Confirm plugin is enabled

**Path resolution errors**:
- Replace all hardcoded paths with `${PLUGIN_ROOT}`
- Verify paths are relative
- Check that referenced files exist

**Auto-discovery not working**:
- Confirm directories are at plugin root
- Check file naming follows conventions
- Verify custom paths in manifest are correct
- Restart to reload plugin configuration
