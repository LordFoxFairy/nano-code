# NanoCode

A Claude Code-inspired AI-powered coding assistant built on the [deepagents](https://github.com/deepagents) framework. NanoCode provides an interactive CLI for software engineering tasks with full support for skills, subagents, and human-in-the-loop (HITL) workflows.

## Features

- **Multi-Model Support**: Works with Claude Opus, Sonnet, and Haiku via configurable providers (OpenRouter, Anthropic, etc.)
- **Skills System**: Extensible skill definitions in `.agents/skills/` directories
- **Subagents**: Define specialized agents for specific tasks
- **HITL (Human-in-the-Loop)**: Approval workflow for file writes and command execution
- **Tool Registry**: Centralized tool management with restriction support
- **Security Sandbox**: 50+ security patterns to block dangerous commands
- **Session Management**: Save, restore, and manage conversation sessions
- **Streaming Responses**: Real-time response streaming with abort support

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

## Usage

### Basic Commands

```
/help           Show available commands
/model [name]   Switch model (opus, sonnet, haiku)
/clear          Clear conversation context
/history [n]    Show last n messages
/save [name]    Save current session
/skills         List available skills
/status         Show session status
/exit           Exit NanoCode
```

### Skills

Skills are defined in `.agents/skills/` directories. Each skill has a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: A custom skill
---

# My Skill

Skill instructions and knowledge...
```

Skills can have commands in `commands/*.md`:

```markdown
---
description: Run a specific action
allowed-tools: Read, Write, Glob
model: sonnet
---

Instructions for this command...
```

### Subagents

Define subagents in `.agents/skills/*/agents/*.md`:

```markdown
---
name: code-reviewer
description: Reviews code for quality issues
model: sonnet
tools:
  - read
  - glob
  - grep
---

You are a code review specialist...
```

## Architecture

```
src/
├── agent/           # Agent factory, tools, security
│   ├── factory.ts   # Agent creation and configuration
│   ├── tools.ts     # Custom NanoCode tools
│   ├── security.ts  # Command security patterns
│   ├── tool-registry.ts  # Tool management
│   └── sandbox.ts   # Local execution sandbox
├── cli/             # CLI interface
│   ├── ui/          # Ink-based UI components
│   ├── commands.ts  # Slash command handling
│   └── session.ts   # Session management
├── core/            # Core infrastructure
│   ├── config/      # Configuration loading
│   ├── llm/         # LLM model resolution
│   └── agent/       # Agent/skill loaders
└── middleware/      # Middleware modules
    ├── tool-restriction.ts  # Tool access control
    └── stop-validation.ts   # Stop condition checks
```

## Security

NanoCode includes comprehensive security features:

- **Command Blocking**: 50+ patterns for dangerous commands (rm -rf /, fork bombs, privilege escalation, etc.)
- **Path Blacklisting**: System directories are protected from modification
- **Tool Restrictions**: Skills can limit which tools are available
- **HITL Approval**: File writes and command execution require human approval by default

## Development

```bash
# Run tests
npm test

# Run specific tests
npm test -- --run tests/unit/

# Build
npm run build

# Lint
npm run lint

# Type check
npm run typecheck
```

## Testing

363+ tests covering:
- Unit tests for all modules
- Integration tests for CLI and agent interaction
- E2E tests for common workflows
- Security pattern validation

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
  allowedTools: ['read', 'write', 'glob'],
}).build();
```

### ToolRegistry

```typescript
import { ToolRegistry, getGlobalToolRegistry } from 'nano-code';

const registry = getGlobalToolRegistry();
registry.register(myTool);

const { resolved, missing } = registry.resolveTools(['read', 'write']);
```

### Security

```typescript
import { checkCommandSecurity, isDangerous } from 'nano-code';

const result = checkCommandSecurity('rm -rf /');
// { allowed: false, severity: 'block', category: 'file_destruction' }

if (isDangerous(command)) {
  throw new Error('Dangerous command blocked');
}
```

## License

MIT

## Credits

- Built on [deepagents](https://github.com/deepagents) framework
- Inspired by [Claude Code](https://claude.ai/claude-code)
- Uses [LangChain](https://langchain.com/) and [LangGraph](https://langchain-ai.github.io/langgraph/)
