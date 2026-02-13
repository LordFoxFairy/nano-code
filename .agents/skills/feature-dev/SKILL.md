---
name: feature-dev
description: This skill should be used when the user asks to "develop a feature", "implement a new feature", "add functionality", "build a feature", "create a feature", "make a feature", "add support for", "/feature-dev", or mentions creating new features with proper planning and architecture.
version: 1.0.0
---

# Feature Development Workflow

A systematic 7-phase approach to building new features with codebase understanding and architecture focus.

## Overview

This skill provides a comprehensive workflow for developing features:
1. **Discovery** - Understand requirements
2. **Codebase Exploration** - Analyze existing patterns
3. **Clarifying Questions** - Resolve ambiguities
4. **Architecture Design** - Plan implementation
5. **Implementation** - Build the feature
6. **Quality Review** - Ensure code quality
7. **Summary** - Document accomplishments

## Core Principles

- **Ask clarifying questions**: Identify ambiguities before coding
- **Understand before acting**: Read and comprehend existing patterns first
- **Simple and elegant**: Prioritize readable, maintainable code
- **Use parallel agents**: Launch exploration/review agents in parallel

## Available Agents

### code-explorer
Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, and documenting dependencies.

**Use for**: Finding similar features, understanding architecture, tracing code flow

### code-architect
Designs feature architectures by analyzing existing patterns and providing implementation blueprints.

**Use for**: Designing new features, planning implementation, choosing approaches

### code-reviewer
Reviews code for bugs, style issues, and project convention adherence with confidence-based filtering.

**Use for**: Quality review, bug detection, convention compliance

## Workflow Details

### Phase 1: Discovery
- Create todo list with all phases
- Clarify feature requirements with user
- Summarize understanding and confirm

### Phase 2: Codebase Exploration
- Launch 2-3 code-explorer agents in parallel
- Each targets different aspect: similar features, architecture, patterns
- Read all files identified by agents
- Present comprehensive summary

### Phase 3: Clarifying Questions
**CRITICAL - DO NOT SKIP**
- Identify underspecified aspects: edge cases, error handling, scope
- Present all questions in organized list
- Wait for answers before proceeding

### Phase 4: Architecture Design
- Launch 2-3 code-architect agents with different focuses
- Review approaches: minimal changes, clean architecture, pragmatic balance
- Present recommendation with reasoning
- Ask user preference

### Phase 5: Implementation
**DO NOT START WITHOUT USER APPROVAL**
- Wait for explicit approval
- Read all relevant files
- Implement following chosen architecture
- Follow codebase conventions

### Phase 6: Quality Review
- Launch 3 code-reviewer agents in parallel
- Focus areas: simplicity/DRY, bugs/correctness, conventions
- Present findings with severity
- Address based on user decision

### Phase 7: Summary
- Mark todos complete
- Summarize: what was built, decisions made, files modified
- Suggest next steps

## Agent Definitions

See `agents/` directory for detailed agent specifications:
- `agents/code-explorer.md`
- `agents/code-architect.md`
- `agents/code-reviewer.md`

## Command Reference

See `commands/feature-dev.md` for the full command prompt template.
