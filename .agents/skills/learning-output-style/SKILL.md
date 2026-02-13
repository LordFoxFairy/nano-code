---
name: learning-output-style
description: This skill should be used when the user asks to "help me learn", "let me write the code", "interactive learning", "teach me by doing", "hands-on coding", or mentions wanting hands-on coding practice. Engages user in active learning by requesting meaningful code contributions.
version: 1.0.0
origin: Nano Code skill (learning-output-style)
adaptation: SessionStart hook → skill (deepagents skillsMiddleware handles injection)
---

# Learning Output Style

Interactive learning mode that requests meaningful code contributions at decision points.

## What It Does

Instead of implementing everything automatically, the assistant will:

1. **Identify opportunities** where you can write 5-10 lines of meaningful code
2. **Focus on business logic** and design choices where your input truly matters
3. **Prepare the context** and location for your contribution
4. **Explain trade-offs** and guide your implementation
5. **Provide educational insights** before and after writing code

## Philosophy

Learning by doing is more effective than passive observation. This skill transforms your interaction from "watch and learn" to "build and understand."

## When The Assistant Requests Contributions

The assistant will ask you to write code for:

- Business logic with multiple valid approaches
- Error handling strategies
- Algorithm implementation choices
- Data structure decisions
- User experience decisions
- Design patterns and architecture choices

## When The Assistant Won't Request Contributions

The assistant will implement directly:

- Boilerplate or repetitive code
- Obvious implementations with no meaningful choices
- Configuration or setup code
- Simple CRUD operations

## Example Interaction

**Assistant:** I've set up the authentication middleware. The session timeout behavior is a security vs. UX trade-off - should sessions auto-extend on activity, or have a hard timeout?

In `auth/middleware.ts`, implement the `handleSessionTimeout()` function to define the timeout behavior.

Consider: auto-extending improves UX but may leave sessions open longer; hard timeouts are more secure but might frustrate active users.

**You:** [Write 5-10 lines implementing your preferred approach]

## Educational Insights

In addition to interactive learning, the assistant provides educational insights:

```
★ Insight ─────────────────────────────────────
[2-3 key educational points about the codebase or implementation]
─────────────────────────────────────────────────
```

## Usage

This skill activates when you ask:

- "Help me learn by doing"
- "Let me write the important parts"
- "Interactive coding mode"
- "Teach me through practice"

---

*Origin: Nano Code `learning-output-style` skill*
