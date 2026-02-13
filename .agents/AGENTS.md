# NanoCode Project

## Overview

NanoCode is an open-source AI coding assistant CLI, inspired by Claude Code. It provides an intelligent terminal interface for code generation, debugging, and development workflow automation.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js (ESM)
- **Agent Framework**: deepagents (LangGraph-based)
- **CLI Framework**: Commander.js + Ink (React for terminal)
- **LLM Provider**: Anthropic Claude (configurable)
- **Testing**: Vitest

## Directory Structure

```
src/
├── index.ts           # Entry point
├── cli/               # CLI interface
│   ├── index.ts       # CLI runner
│   ├── session.ts     # Session management
│   ├── commands.ts    # Slash command handler
│   └── ui/            # Ink React components
│       ├── App.tsx
│       ├── theme.ts
│       └── components/
├── core/              # Core utilities
│   ├── config/        # Configuration system
│   ├── llm/           # LLM resolver
│   └── errors/        # Error types
└── agent/             # Agent implementation
    ├── factory.ts     # Agent factory
    ├── sandbox.ts     # Local sandbox (file ops)
    └── shell-session.ts # Shell execution

tests/                 # Test files
├── unit/
├── integration/
└── e2e/

.agents/               # Agent configuration
├── config.json        # Project config
├── AGENTS.md          # This file (project memory)
└── skills/            # Custom skills
```

## Coding Guidelines

1. **ESM Only**: Use `.js` extensions in imports, no CommonJS
2. **Strict TypeScript**: Enable strict mode, use proper types
3. **Conventional Commits**: Follow conventional commit format
4. **Test Coverage**: Write tests for new features
5. **Ink Components**: Use React/Ink for all CLI UI

## Important Patterns

### Agent Factory Pattern
```typescript
import { createDeepAgent } from 'deepagents';
const agent = createDeepAgent({
    model: chatModel,
    backend: new LocalSandbox(shellSession),
    skills: ['.agents/skills/'],
    memory: ['.agents/AGENTS.md'],
});
```

### Ink Component Pattern
```tsx
import { Box, Text } from 'ink';
export const MyComponent: React.FC<Props> = ({ prop }) => (
    <Box flexDirection="column">
        <Text>{prop}</Text>
    </Box>
);
```

## Commands

- `npm run build` - Compile TypeScript
- `npm test` - Run all tests
- `npm run start` - Run CLI (development)
- `minicode` - Run CLI (after npm link)

## Skills & Subagents

Skills and subagents are automatically loaded by deepagents from `.agents/skills/`.

- Skills: SKILL.md files provide expert knowledge injection
- Subagents: agents/*.md files are loaded as task-delegatable agents

## Notes

- HITL (Human-in-the-Loop) is configured for write_file, edit_file, execute
- Session data stored in `~/.agents/sessions/`
- Global config at `~/.agents/config.json`
