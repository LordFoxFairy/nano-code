---
name: pr-review-toolkit
description: This skill should be used when the user asks to "review PR thoroughly", "analyze test coverage", "check error handling", "review type design", "simplify code", "check comments", "review documentation", "check tests", "silent failures", "make code clearer", or mentions comprehensive pull request review with specialized agents.
version: 1.0.0
---

# PR Review Toolkit

A collection of 6 specialized agents for thorough pull request review.

## Available Agents

### 1. comment-analyzer
**Focus**: Code comment accuracy and maintainability

Analyzes:
- Comment accuracy vs actual code
- Documentation completeness
- Comment rot and technical debt

**Trigger**: "Check if comments are accurate", "Review documentation"

### 2. pr-test-analyzer
**Focus**: Test coverage quality and completeness

Analyzes:
- Behavioral vs line coverage
- Critical gaps in test coverage
- Edge cases and error conditions

**Trigger**: "Check if tests are thorough", "Review test coverage"

### 3. silent-failure-hunter
**Focus**: Error handling and silent failures

Analyzes:
- Silent failures in catch blocks
- Inadequate error handling
- Missing error logging

**Trigger**: "Review error handling", "Check for silent failures"

### 4. type-design-analyzer
**Focus**: Type design quality and invariants

Rates (1-10):
- Type encapsulation
- Invariant expression
- Type usefulness
- Invariant enforcement

**Trigger**: "Review type design", "Check type invariants"

### 5. code-reviewer
**Focus**: General code review for guidelines

Analyzes:
- Project guideline compliance
- Style violations
- Bug detection

**Trigger**: "Review my changes", "Check if everything looks good"

### 6. code-simplifier
**Focus**: Code simplification and refactoring

Analyzes:
- Code clarity and readability
- Unnecessary complexity
- Redundant abstractions

**Trigger**: "Simplify this code", "Make this clearer"

## Usage Patterns

### Individual Agent
```
"Can you check if the tests cover all edge cases?"
→ Triggers pr-test-analyzer
```

### Comprehensive Review
```
"Review this PR thoroughly:
1. Test coverage
2. Error handling
3. Code comments
4. Type design
5. General quality"
```

## Agent Definitions

See `agents/` directory for detailed specifications:
- `agents/comment-analyzer.md`
- `agents/pr-test-analyzer.md`
- `agents/silent-failure-hunter.md`
- `agents/type-design-analyzer.md`
- `agents/code-reviewer.md`
- `agents/code-simplifier.md`
