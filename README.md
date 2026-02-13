# NanoCode

A Claude Code-inspired AI-powered coding assistant built on the [deepagents](https://github.com/deepagents) framework. NanoCode provides an interactive CLI for software engineering tasks with comprehensive support for skills, subagents, hooks, plugins, and human-in-the-loop (HITL) workflows.

## Features

### Core Capabilities

- **Multi-Model Support**: Works with Claude Opus, Sonnet, and Haiku via configurable providers (OpenRouter, Anthropic, etc.)
- **Skills System**: Extensible skill definitions in `.agents/skills/` directories with dynamic arguments
- **Subagents**: Define specialized agents for specific tasks
- **HITL (Human-in-the-Loop)**: Approval workflow for file writes and command execution
- **Tool Registry**: Centralized tool management with restriction support
- **Session Management**: Save, restore, rename, and manage conversation sessions
- **Streaming Responses**: Real-time response streaming with abort support

### Advanced Features

- **Hook System**: 9 event types for customizing agent behavior
- **Plugin Architecture**: Extensible plugin system for custom functionality
- **Permission Rules**: Fine-grained tool permission management (ask/allow/deny)
- **Plan Mode**: Track and review proposed changes before execution
- **MCP Integration**: Model Context Protocol support for external tools
- **LSP Integration**: Language Server Protocol for code diagnostics
- **Security Sandbox**: 50+ security patterns to block dangerous commands
- **Middleware System**: Token tracking, cost calculation, and context summarization

## Installation

```bash
# Clone the repository
git clone https://github.com/thefoxfairy/nano-code.git
cd nano-code

# Install dependencies
npm install

# Build
npm run build

# Run
npm start

# Or run directly with tsx
npm run dev
```

### Global Installation

```bash
npm link

# Now you can use it anywhere
minicode
```

## Configuration

Create a `nano.config.json` file in your project root or home directory:

```json
{
  "providers": [
    {
      "name": "openrouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "YOUR_API_KEY",
      "models": [
        "anthropic/claude-opus-4",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-3-haiku"
      ]
    }
  ],
  "router": {
    "opus": "openrouter:anthropic/claude-opus-4",
    "sonnet": "openrouter:anthropic/claude-sonnet-4",
    "haiku": "openrouter:anthropic/claude-3-haiku",
    "default": "openrouter:anthropic/claude-sonnet-4"
  },
  "settings": {
    "defaultMode": "sonnet",
    "interruptOn": {
      "write_file": true,
      "edit_file": true,
      "execute": true
    },
    "streaming": true
  }
}
```

## CLI Commands

### Basic Commands

```
/help           Show available commands and skills
/model [name]   Switch model (opus, sonnet, haiku)
/clear          Clear conversation context (starts new thread)
/exit           Exit NanoCode
```

### Session Management

```
/history [n]    Show conversation history (last n messages)
/save [name]    Save current session with optional name
/resume [id]    Resume a previous session (by ID or name)
/rename <name>  Rename the current session
/sessions       List all saved sessions
```

### Context & Status

```
/status         Show current session status
/context        Show token usage visualization with cost estimate
/compact        Summarize and compact context
```

### Skills & Tools

```
/skills         List all available skills
/plugins        Manage installed plugins
/permissions    Manage tool permission rules
/keybindings    Show keyboard shortcuts
```

### Plan Mode

```
/plan           Enter/exit plan mode (track changes without executing)
/plan:show      Show current proposed changes
/plan:accept    Accept and execute all proposed changes
/plan:reject [feedback]  Reject plan with optional feedback
/plan:save [name]  Save current plan to disk
/plan:load <id> Load a saved plan
/plan:list      List all saved plans
/plan:auto [on|off]  Toggle auto-accept mode
```

### Integration Commands

```
/mcp            Show MCP server status and available tools
/mcp list       List all configured MCP servers
/mcp tools      List all MCP-provided tools
/mcp connect <server>    Connect to a specific server
/mcp disconnect <server> Disconnect from a server

/lsp            Show LSP server status
/lsp start <lang>   Start language server (typescript, python, etc.)
/lsp stop <lang>    Stop language server
/lsp restart <lang> Restart language server
/lsp supported      List supported languages
```

## Hook System

NanoCode supports 9 event types for customizing agent behavior:

| Event Type | Description |
|------------|-------------|
| `PreToolUse` | Before a tool is executed (can modify input or block) |
| `PostToolUse` | After a tool completes (access to result) |
| `UserPromptSubmit` | When user submits a prompt (can modify) |
| `Stop` | When agent completes a response |
| `SubagentStop` | When a subagent completes |
| `SessionStart` | When a new session begins |
| `SessionEnd` | When a session ends |
| `PreCompact` | Before context is summarized |
| `Notification` | For custom notifications |

### Hook Configuration

Create a `hooks.json` file in your `.agents/` directory:

```json
{
  "description": "Project hooks configuration",
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/validate-tool.sh",
            "timeout": 5000,
            "description": "Validate tool inputs"
          }
        ],
        "matcher": "Bash|Write"
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "once": true
          }
        ]
      }
    ]
  }
}
```

### Hook Types

- **Command hooks**: Execute shell commands with access to tool context via environment variables
- **Prompt hooks**: Use LLM to process and respond to events

## Plugin System

Plugins extend NanoCode with custom skills, commands, agents, and hooks.

### Plugin Structure

```
my-plugin/
  plugin.json       # Plugin manifest
  skills/           # Custom skills
  commands/         # Custom commands
  agents/           # Custom subagents
  hooks/            # Custom hooks
```

### Plugin Manifest (plugin.json)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My custom plugin",
  "author": "Your Name",
  "capabilities": {
    "skills": ["my-skill"],
    "commands": ["my-command"],
    "hooks": ["my-hook"]
  }
}
```

### Plugin Management

```bash
/plugins          # List installed plugins
/plugins list     # Same as above
```

## Permission Rules

Control tool access with fine-grained permission rules:

### Permission Levels

| Level | Description |
|-------|-------------|
| `allow` | Tool executes without confirmation |
| `ask` | Requires user confirmation (default) |
| `deny` | Tool is blocked |

### Configuration

Create `~/.nanocode/permissions.json` for global rules or `.nanocode/permissions.json` for project-specific rules:

```json
{
  "rules": [
    {
      "tool": "Bash",
      "arguments": "npm *",
      "level": "allow"
    },
    {
      "tool": "Write",
      "arguments": "*.env*",
      "level": "deny"
    },
    {
      "tool": "*",
      "level": "ask"
    }
  ]
}
```

### CLI Management

```bash
/permissions              # Show current rules
/permissions list         # List all rules
/permissions add <rule>   # Add a new rule
/permissions remove <id>  # Remove a rule
```

## Plan Mode

Plan mode allows you to review proposed changes before they're executed:

```bash
# Enter plan mode
/plan

# The agent will now record changes instead of executing them
# You'll see: [Plan Mode] Recorded tool call: Write

# Review proposed changes
/plan:show

# Accept all changes
/plan:accept

# Or reject with feedback
/plan:reject "Please don't modify the config file"

# Save plan for later
/plan:save "feature-refactor"

# Load a saved plan
/plan:load abc123

# Enable auto-accept
/plan:auto on
```

## MCP Integration

Model Context Protocol (MCP) enables integration with external tool servers.

### Configuration

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@my/mcp-server"]
    },
    "remote-server": {
      "url": "https://my-mcp-server.example.com/sse"
    }
  }
}
```

Or in `~/.nanocode/mcp.json` for global configuration.

## LSP Integration

Language Server Protocol provides code intelligence features:

### Supported Languages

| Language | Server | Install |
|----------|--------|---------|
| TypeScript/JavaScript | typescript-language-server | `npm i -g typescript-language-server` |
| Python | pylsp | `pip install python-lsp-server` |
| Rust | rust-analyzer | Via rustup |
| Go | gopls | `go install golang.org/x/tools/gopls@latest` |

### Usage

```bash
/lsp start typescript   # Start TypeScript LSP
/lsp                    # Check status
```

## Skills

Skills are defined in `.agents/skills/` directories. Each skill has a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: A custom skill for specific tasks
---

# My Skill

Instructions and knowledge for this skill...

### /my-command

This is a command within the skill.
```

### Skill Commands

Commands can be defined inline or in `commands/*.md`:

```markdown
---
description: Run a specific action
allowed-tools: Read, Write, Glob
model: sonnet
argument-hint: <file-path>
---

Process the file at $1 and apply transformations.

Include content from @./config.json for reference.

Execute: !`git status`
```

### Dynamic Arguments

- `$1`, `$2`, `$3`... - Positional arguments
- `$ARGUMENTS` - All arguments as a single string
- `@filepath` - Include file contents
- `` !`command` `` - Execute bash and include output

## Subagents

Define subagents in `.agents/skills/*/agents/*.md`:

```markdown
---
name: code-reviewer
description: Reviews code for quality issues
model: sonnet
tools:
  - Read
  - Glob
  - Grep
---

You are a code review specialist. Analyze code for:
- Code quality issues
- Security vulnerabilities
- Performance problems
- Best practice violations
```

## Security

NanoCode includes comprehensive security features:

### Command Security

50+ security patterns blocking dangerous operations:

- **File Destruction**: `rm -rf /`, disk writes, filesystem formatting
- **Privilege Escalation**: sudo exploits, SUID/SGID manipulation
- **Network Attacks**: Reverse shells, firewall manipulation
- **Sensitive Files**: SSH keys, AWS credentials, password files
- **System Services**: Service manipulation, shutdown commands
- **Crypto/Malware**: Mining software, ransomware patterns
- **Code Injection**: Curl pipe to shell, eval injection
- **Obfuscation**: Base64 decoding, hex payloads, Unicode evasion

### Path Blacklist

System directories protected from modification:

```
/, /bin, /sbin, /usr/bin, /usr/sbin, /etc, /boot,
/sys, /proc, /dev, /root, /var/log, /var/run,
/lib, /lib64, /usr/lib, /usr/lib64
```

### HITL Approval

By default, file writes and command execution require human approval.

## Middleware

NanoCode's middleware system provides:

### Token Tracking

```typescript
import { getUsageStats } from 'nano-code';

const stats = getUsageStats();
console.log(`Total tokens: ${stats.totalTokens}`);
console.log(`Estimated cost: $${stats.estimatedCost.toFixed(4)}`);
```

### Cost Calculation

Automatic cost calculation based on model pricing:

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Claude Sonnet 4 | $3.00 | $15.00 |
| Claude Opus 4 | $15.00 | $75.00 |
| Claude 3 Haiku | $0.25 | $1.25 |

### Context Summarization

Automatic context compaction when approaching token limits:

```typescript
const agent = await new AgentFactory({
  config,
  mode: 'sonnet',
  cwd: process.cwd(),
  summarization: {
    maxTokens: 100000,
    keepLastN: 10,
  },
}).build();
```

## Architecture

```
src/
├── agent/              # Agent factory, tools, security
│   ├── factory.ts      # Agent creation and configuration
│   ├── tools.ts        # Custom NanoCode tools
│   ├── security.ts     # Command security patterns (50+)
│   ├── tool-registry.ts # Tool management
│   └── sandbox.ts      # Local execution sandbox
├── cli/                # CLI interface
│   ├── ui/             # Ink-based UI components
│   ├── commands.ts     # Slash command handling
│   ├── plan-mode.ts    # Plan mode implementation
│   ├── keybindings.ts  # Keyboard shortcuts
│   └── session.ts      # Session management
├── core/               # Core infrastructure
│   ├── config/         # Configuration loading
│   ├── llm/            # LLM model resolution
│   ├── mcp/            # MCP integration
│   ├── lsp/            # LSP integration
│   └── agent/          # Agent/skill loaders
├── hooks/              # Hook system
│   ├── types.ts        # Hook type definitions
│   ├── manager.ts      # Hook lifecycle management
│   └── executor.ts     # Hook execution
├── plugins/            # Plugin system
│   ├── types.ts        # Plugin manifest schema
│   ├── manager.ts      # Plugin lifecycle
│   └── loader.ts       # Plugin discovery
├── permissions/        # Permission rules
│   ├── types.ts        # Permission types
│   ├── rules.ts        # Rule matching
│   └── manager.ts      # Rule management
└── middleware/         # Middleware modules
    ├── agent-middleware.ts  # Token/cost tracking
    ├── tool-restriction.ts  # Tool access control
    └── stop-validation.ts   # Stop condition checks
```

## API

### AgentFactory

```typescript
import { AgentFactory } from 'nano-code';

const agent = await new AgentFactory({
  config,
  mode: 'sonnet',
  cwd: process.cwd(),
  skills: ['.agents/skills/'],
  hitl: true,
  allowedTools: ['Read', 'Write', 'Glob'],
  enableTokenTracking: true,
  enableCostTracking: true,
  onUsageUpdate: (stats) => {
    console.log(`Cost: $${stats.estimatedCost.toFixed(4)}`);
  },
}).build();
```

### ToolRegistry

```typescript
import { getGlobalToolRegistry } from 'nano-code';

const registry = getGlobalToolRegistry();
registry.register(myTool);

const { resolved, missing } = registry.resolveTools(['Read', 'Write']);
```

### Security

```typescript
import { checkCommandSecurity, isDangerous, performSecurityCheck } from 'nano-code';

const result = checkCommandSecurity('rm -rf /');
// { allowed: false, severity: 'block', category: 'file_destruction' }

if (isDangerous(command)) {
  throw new Error('Dangerous command blocked');
}

// Full check with paths
const fullResult = performSecurityCheck('cat /etc/shadow', ['/etc/shadow']);
```

### Permission Manager

```typescript
import { getPermissionManager } from 'nano-code';

const manager = getPermissionManager();

// Check permission
const level = manager.getPermission({
  tool: 'Bash',
  arguments: { command: 'npm install' }
});

// Add rules
manager.addGlobalRule({
  tool: 'Write',
  arguments: '*.ts',
  level: 'allow'
});
```

### Hook Manager

```typescript
import { HookManager } from 'nano-code';

const hooks = new HookManager({ configPath: '.agents/hooks.json' });

// Execute hooks
const result = await hooks.execute({
  event: 'PreToolUse',
  toolName: 'Bash',
  toolInput: { command: 'npm test' },
  context: { sessionId: '...', cwd: process.cwd() }
});

if (!result.continue) {
  // Hook blocked the operation
}
```

## Development

```bash
# Run tests
npm test

# Run specific tests
npm test -- --run tests/unit/

# Run with coverage
npm run test:coverage

# Build
npm run build

# Lint
npm run lint

# Type check
npm run typecheck
```

## Testing

511+ tests covering:

- Unit tests for all modules
- Integration tests for CLI and agent interaction
- E2E tests for common workflows
- Security pattern validation
- Hook system tests
- Plugin loading tests
- Permission rule matching

## Requirements

- Node.js >= 18.0.0
- npm or yarn

## Dependencies

- **deepagents**: Agent framework
- **@langchain/anthropic**: Claude API integration
- **@modelcontextprotocol/sdk**: MCP client
- **ink**: Terminal UI components
- **chalk**: Terminal styling
- **zod**: Schema validation

## License

MIT

## Credits

- Built on [deepagents](https://github.com/deepagents) framework
- Inspired by [Claude Code](https://claude.ai/claude-code)
- Uses [LangChain](https://langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraph/)
