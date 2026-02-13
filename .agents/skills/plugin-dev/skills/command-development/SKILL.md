---
name: Command Development
description: This skill should be used when the user asks to "create a slash command", "add a command", "write a custom command", "define command arguments", "use command frontmatter", "organize commands", "create command with file references", "interactive command", or needs guidance on slash command structure, YAML frontmatter fields, dynamic arguments, bash execution in commands, user interaction patterns, or command development best practices.
version: 1.0.0
---

# Command Development

## Overview

Slash commands are frequently-used prompts defined as Markdown files that the agent executes during interactive sessions. Understanding command structure, frontmatter options, and dynamic features enables creating powerful, reusable workflows.

**Key concepts:**
- Markdown file format for commands
- YAML frontmatter for configuration
- Dynamic arguments and file references
- Bash execution for context
- Command organization and namespacing

## Command Basics

### What is a Slash Command?

A slash command is a Markdown file containing a prompt that the agent executes when invoked. Commands provide:
- **Reusability**: Define once, use repeatedly
- **Consistency**: Standardize common workflows
- **Sharing**: Distribute across team or projects
- **Efficiency**: Quick access to complex prompts

### Critical: Commands are Instructions FOR the Agent

**Commands are written for agent consumption, not human consumption.**

When a user invokes `/command-name`, the command content becomes the agent's instructions. Write commands as directives TO the agent about what to do, not as messages TO the user.

**Correct approach (instructions for agent):**
```markdown
Review this code for security vulnerabilities including:
- SQL injection
- XSS attacks
- Authentication issues

Provide specific line numbers and severity ratings.
```

**Incorrect approach (messages to user):**
```markdown
This command will review your code for security issues.
You'll receive a report with vulnerability details.
```

### Command Locations

**Project commands** (shared with team):
- Location: `commands/`
- Scope: Available in specific project/plugin
- Use for: Team workflows, project-specific tasks

**Personal commands** (available everywhere):
- Location: `~/.config/commands/`
- Scope: Available in all projects
- Use for: Personal workflows, cross-project utilities

**Plugin commands** (bundled with plugins):
- Location: `plugin-name/commands/`
- Scope: Available when plugin installed
- Use for: Plugin-specific functionality

## File Format

### Basic Structure

Commands are Markdown files with `.md` extension:

```
commands/
+-- review.md           # /review command
+-- test.md             # /test command
+-- deploy.md           # /deploy command
```

**Simple command:**
```markdown
Review this code for security vulnerabilities including:
- SQL injection
- XSS attacks
- Authentication bypass
- Insecure data handling
```

No frontmatter needed for basic commands.

### With YAML Frontmatter

Add configuration using YAML frontmatter:

```markdown
---
description: Review code for security issues
allowed-tools: Read, Grep, Bash(git:*)
model: sonnet
---

Review this code for security vulnerabilities...
```

## YAML Frontmatter Fields

### description

**Purpose:** Brief description shown in help
**Type:** String
**Default:** First line of command prompt

```yaml
---
description: Review pull request for code quality
---
```

### allowed-tools

**Purpose:** Specify which tools command can use
**Type:** String or Array
**Default:** Inherits from conversation

```yaml
---
allowed-tools: Read, Write, Edit, Bash(git:*)
---
```

### model

**Purpose:** Specify model for command execution
**Type:** String (sonnet, opus, haiku)
**Default:** Inherits from conversation

```yaml
---
model: haiku
---
```

### argument-hint

**Purpose:** Document expected arguments for autocomplete
**Type:** String
**Default:** None

```yaml
---
argument-hint: [pr-number] [priority] [assignee]
---
```

## Dynamic Arguments

### Using $ARGUMENTS

Capture all arguments as single string:

```markdown
---
description: Fix issue by number
argument-hint: [issue-number]
---

Fix issue #$ARGUMENTS following our coding standards and best practices.
```

**Usage:**
```
> /fix-issue 123
```

**Expands to:**
```
Fix issue #123 following our coding standards...
```

### Using Positional Arguments

Capture individual arguments with `$1`, `$2`, `$3`, etc.:

```markdown
---
description: Review PR with priority and assignee
argument-hint: [pr-number] [priority] [assignee]
---

Review pull request #$1 with priority level $2.
After review, assign to $3 for follow-up.
```

**Usage:**
```
> /review-pr 123 high alice
```

## File References

### Using @ Syntax

Include file contents in command:

```markdown
---
description: Review specific file
argument-hint: [file-path]
---

Review @$1 for:
- Code quality
- Best practices
- Potential bugs
```

**Usage:**
```
> /review-file src/api/users.ts
```

### Multiple File References

Reference multiple files:

```markdown
Compare @src/old-version.js with @src/new-version.js

Identify:
- Breaking changes
- New features
- Bug fixes
```

## Command Organization

### Flat Structure

Simple organization for small command sets:

```
commands/
+-- build.md
+-- test.md
+-- deploy.md
+-- review.md
+-- docs.md
```

### Namespaced Structure

Organize commands in subdirectories:

```
commands/
+-- ci/
|   +-- build.md        # /build (ci)
|   +-- test.md         # /test (ci)
|   +-- lint.md         # /lint (ci)
+-- git/
|   +-- commit.md       # /commit (git)
|   +-- pr.md           # /pr (git)
+-- docs/
    +-- generate.md     # /generate (docs)
    +-- publish.md      # /publish (docs)
```

## Best Practices

### Command Design

1. **Single responsibility:** One command, one task
2. **Clear descriptions:** Self-explanatory in help
3. **Explicit dependencies:** Use `allowed-tools` when needed
4. **Document arguments:** Always provide `argument-hint`
5. **Consistent naming:** Use verb-noun pattern (review-pr, fix-issue)

### Argument Handling

1. **Validate arguments:** Check for required arguments in prompt
2. **Provide defaults:** Suggest defaults when arguments missing
3. **Document format:** Explain expected argument format
4. **Handle edge cases:** Consider missing or invalid arguments

### Documentation

1. **Add comments:** Explain complex logic
2. **Provide examples:** Show usage in comments
3. **List requirements:** Document dependencies

```markdown
---
description: Deploy application to environment
argument-hint: [environment] [version]
---

<!--
Usage: /deploy [staging|production] [version]
Requires: AWS credentials configured
Example: /deploy staging v1.2.3
-->

Deploy application to $1 environment using version $2...
```

## Common Patterns

### Review Pattern

```markdown
---
description: Review code changes
allowed-tools: Read, Bash(git:*)
---

Review each file for:
1. Code quality and style
2. Potential bugs or issues
3. Test coverage
4. Documentation needs

Provide specific feedback for each file.
```

### Testing Pattern

```markdown
---
description: Run tests for specific file
argument-hint: [test-file]
allowed-tools: Bash(npm:*)
---

Run tests for $1

Analyze results and suggest fixes for failures.
```

### Documentation Pattern

```markdown
---
description: Generate documentation for file
argument-hint: [source-file]
---

Generate comprehensive documentation for @$1 including:
- Function/class descriptions
- Parameter documentation
- Return value descriptions
- Usage examples
- Edge cases and errors
```

### Workflow Pattern

```markdown
---
description: Complete PR workflow
argument-hint: [pr-number]
allowed-tools: Bash(gh:*), Read
---

PR #$1 Workflow:

1. Fetch PR details
2. Review changes
3. Run checks
4. Approve or request changes
```

## Troubleshooting

**Command not appearing:**
- Check file is in correct directory
- Verify `.md` extension present
- Ensure valid Markdown format
- Restart session

**Arguments not working:**
- Verify `$1`, `$2` syntax correct
- Check `argument-hint` matches usage
- Ensure no extra spaces

**File references not working:**
- Verify `@` syntax correct
- Check file path is valid
- Ensure Read tool allowed
- Use absolute or project-relative paths

## Integration with Plugin Components

Commands can integrate with other plugin components for powerful workflows.

### Agent Integration

Launch plugin agents for complex tasks:

```markdown
---
description: Deep code review
argument-hint: [file-path]
---

Initiate comprehensive review of @$1 using the code-reviewer agent.

The agent will analyze:
- Code structure
- Security issues
- Performance
- Best practices
```

### Skill Integration

Leverage plugin skills for specialized knowledge:

```markdown
---
description: Document API with standards
argument-hint: [api-file]
---

Document API in @$1 following plugin standards.

Use the api-docs-standards skill to ensure:
- Complete endpoint documentation
- Consistent formatting
- Example quality
- Error documentation
```

## Validation Patterns

Commands should validate inputs and resources before processing.

### Argument Validation

```markdown
---
description: Deploy with validation
argument-hint: [environment]
---

Validate environment: $1 must be one of: dev, staging, prod

If $1 is valid environment:
  Deploy to $1
Otherwise:
  Explain valid environments: dev, staging, prod
  Show usage: /deploy [environment]
```

### File Existence Checks

```markdown
---
description: Process configuration
argument-hint: [config-file]
---

Check if file exists: $1

If file exists:
  Process configuration: @$1
Otherwise:
  Explain where to place config file
  Show expected format
  Provide example configuration
```
