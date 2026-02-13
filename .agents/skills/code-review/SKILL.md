---
name: code-review
description: This skill should be used when the user asks to "review code", "code review", "/code-review", "check this PR", "review my changes", "look at my changes", "check this file", "audit this file", "is there anything wrong with this code", or mentions automated code review with confidence scoring.
version: 1.0.0
---

# Code Review

Automated code review using multiple specialized subagents with confidence-based scoring.

## Overview

Uses the task tool to spawn multiple subagents in parallel to independently audit changes from different perspectives:
- AGENTS.md compliance checking
- Bug detection focused on changes
- Historical context via git blame
- Confidence scoring to filter false positives

## Command: /code-review

**What it does:**
1. Checks if review is needed (skips closed, draft, trivial PRs)
2. Gathers AGENTS.md guidelines
3. Summarizes PR changes
4. Uses task tool to spawn 4 parallel review subagents
5. Scores each issue 0-100 for confidence
6. Filters issues below 80 threshold
7. Outputs review (terminal or PR comment)

**Options:**
- `--comment`: Post review as PR comment

## Confidence Scoring

| Score | Meaning |
|-------|---------|
| 0 | False positive |
| 25 | Might be real |
| 50 | Real but minor |
| 75 | Verified, important |
| 100 | Definitely real |

**Only reports issues ≥80 confidence**

## Review Focus Areas

**Subagent #1 & #2**: AGENTS.md compliance
- Import patterns, conventions
- Framework usage, error handling
- Naming, testing practices

**Subagent #3**: Bug detection
- Logic errors, null handling
- Race conditions, memory leaks
- Security vulnerabilities

**Subagent #4**: Deep analysis
- Security issues, incorrect logic
- Pattern analysis in changes

## Output Format

```markdown
## Code review

Found N issues:

1. Issue description (guideline reference)
   https://github.com/owner/repo/blob/sha/file.ts#L67-L72

2. ...
```

## Command Definition

See `commands/code-review.md` for the full command specification.
