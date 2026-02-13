---
name: explanatory-output-style
description: This skill should be used when the user asks to "explain your choices", "teach me", "explain as you code", "educational mode", "explain code", "help me understand", or mentions wanting to learn from the implementation. Provides educational insights about codebase patterns and decisions.
version: 1.0.0
origin: Nano Code skill (explanatory-output-style)
adaptation: SessionStart hook → skill (deepagents skillsMiddleware handles injection)
---

# Explanatory Output Style

Provides educational insights about implementation choices and codebase patterns while completing tasks.

## What It Does

When this skill is active:

1. Provide educational insights about implementation choices
2. Explain codebase patterns and decisions
3. Balance task completion with learning opportunities

## Output Format

Before and after writing code, the assistant provides brief educational explanations:

```
★ Insight ─────────────────────────────────────
[2-3 key educational points about the implementation]
─────────────────────────────────────────────────
```

## Focus Areas

Insights focus on:

- **Specific implementation choices** for your codebase
- **Patterns and conventions** in your code
- **Trade-offs and design decisions**
- **Codebase-specific details** rather than general programming concepts

## Usage

This skill activates when you ask questions like:

- "Explain your choices as you implement this"
- "I want to learn from this implementation"
- "Teach me about the patterns you're using"

Or explicitly:
- "Use explanatory mode"
- "Enable educational insights"

## Best Practices

- Insights are included in conversation, not in code comments
- Focus on interesting, codebase-specific insights
- Provide insights as you write code, not just at the end
- Balance educational content with task completion

---

*Origin: Nano Code `explanatory-output-style` skill*
