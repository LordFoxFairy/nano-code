---
name: Skill Development
description: This skill should be used when the user wants to "create a skill", "add a skill to plugin", "write a new skill", "improve skill description", "organize skill content", or needs guidance on skill structure, progressive disclosure, or skill development best practices.
version: 1.0.0
---

# Skill Development

This skill provides guidance for creating effective skills for plugins.

## About Skills

Skills are modular, self-contained packages that extend capabilities by providing specialized knowledge, workflows, and tools. Think of them as "onboarding guides" for specific domains or tasks - they transform a general-purpose agent into a specialized agent equipped with procedural knowledge that no model can fully possess.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Company-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

### Anatomy of a Skill

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
+-- SKILL.md (required)
|   +-- YAML frontmatter metadata (required)
|   |   +-- name: (required)
|   |   +-- description: (required)
|   +-- Markdown instructions (required)
+-- Bundled Resources (optional)
    +-- scripts/          - Executable code (Python/Bash/etc.)
    +-- references/       - Documentation intended to be loaded into context as needed
    +-- assets/           - Files used in output (templates, icons, fonts, etc.)
```

#### SKILL.md (required)

**Metadata Quality:** The `name` and `description` in YAML frontmatter determine when the skill will be used. Be specific about what the skill does and when to use it. Use the third-person (e.g. "This skill should be used when..." instead of "Use this skill when...").

#### Bundled Resources (optional)

##### Scripts (`scripts/`)

Executable code (Python/Bash/etc.) for tasks that require deterministic reliability or are repeatedly rewritten.

- **When to include**: When the same code is being rewritten repeatedly or deterministic reliability is needed
- **Example**: `scripts/rotate_pdf.py` for PDF rotation tasks
- **Benefits**: Token efficient, deterministic, may be executed without loading into context

##### References (`references/`)

Documentation and reference material intended to be loaded as needed into context.

- **When to include**: For documentation that should be referenced while working
- **Examples**: `references/schema.md` for schemas, `references/policies.md` for policies
- **Benefits**: Keeps SKILL.md lean, loaded only when needed
- **Avoid duplication**: Information should live in either SKILL.md or references files, not both

##### Assets (`assets/`)

Files not intended to be loaded into context, but rather used within the output produced.

- **When to include**: When the skill needs files that will be used in the final output
- **Examples**: `assets/logo.png` for brand assets, `assets/template.html` for templates

### Progressive Disclosure Design Principle

Skills use a three-level loading system to manage context efficiently:

1. **Metadata (name + description)** - Always in context (~100 words)
2. **SKILL.md body** - When skill triggers (<5k words)
3. **Bundled resources** - As needed (Unlimited*)

*Unlimited because scripts can be executed without reading into context window.

## Skill Creation Process

To create a skill, follow the "Skill Creation Process" in order, skipping steps only if there is a clear reason why they are not applicable.

### Step 1: Understanding the Skill with Concrete Examples

Skip this step only when the skill's usage patterns are already clearly understood.

To create an effective skill, clearly understand concrete examples of how the skill will be used. This understanding can come from either direct user examples or generated examples that are validated with user feedback.

For example, when building an image-editor skill, relevant questions include:

- "What functionality should the image-editor skill support?"
- "Can you give some examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

### Step 2: Planning the Reusable Skill Contents

To turn concrete examples into an effective skill, analyze each example by:

1. Considering how to execute on the example from scratch
2. Identifying what scripts, references, and assets would be helpful when executing these workflows repeatedly

### Step 3: Create Skill Structure

Create the skill directory structure:

```bash
mkdir -p plugin-name/skills/skill-name/{references,examples,scripts}
touch plugin-name/skills/skill-name/SKILL.md
```

### Step 4: Edit the Skill

When editing the skill, remember that the skill is being created for another agent instance to use. Focus on including information that would be beneficial and non-obvious.

#### Start with Reusable Skill Contents

Begin implementation with the reusable resources identified above: `scripts/`, `references/`, and `assets/` files.

Also, delete any example files and directories not needed for the skill. Create only the directories you actually need.

#### Update SKILL.md

**Writing Style:** Write the entire skill using **imperative/infinitive form** (verb-first instructions), not second person. Use objective, instructional language.

**Description (Frontmatter):** Use third-person format with specific trigger phrases:

```yaml
---
name: Skill Name
description: This skill should be used when the user asks to "specific phrase 1", "specific phrase 2", "specific phrase 3". Include exact phrases users would say that should trigger this skill.
version: 1.0.0
---
```

**Good description examples:**
```yaml
description: This skill should be used when the user asks to "create a hook", "add a PreToolUse hook", "validate tool use", "implement prompt-based hooks", or mentions hook events.
```

**Bad description examples:**
```yaml
description: Use this skill when working with hooks.  # Wrong person, vague
description: Load when user needs hook help.  # Not third person
description: Provides hook guidance.  # No trigger phrases
```

**Keep SKILL.md lean:** Target 1,500-2,000 words for the body. Move detailed content to references/:
- Detailed patterns -> `references/patterns.md`
- Advanced techniques -> `references/advanced.md`
- API references -> `references/api-reference.md`

### Step 5: Validate and Test

**Validation checklist:**
1. **Check structure**: Skill directory in `plugin-name/skills/skill-name/`
2. **Validate SKILL.md**: Has frontmatter with name and description
3. **Check trigger phrases**: Description includes specific user queries
4. **Verify writing style**: Body uses imperative/infinitive form, not second person
5. **Test progressive disclosure**: SKILL.md is lean (~1,500-2,000 words), detailed content in references/
6. **Check references**: All referenced files exist
7. **Validate examples**: Examples are complete and correct
8. **Test scripts**: Scripts are executable and work correctly

### Step 6: Iterate

After testing the skill, users may request improvements.

**Iteration workflow:**
1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Identify how SKILL.md or bundled resources should be updated
4. Implement changes and test again

## Writing Style Requirements

### Imperative/Infinitive Form

Write using verb-first instructions, not second person:

**Correct (imperative):**
```
To create a hook, define the event type.
Configure the MCP server with authentication.
Validate settings before use.
```

**Incorrect (second person):**
```
You should create a hook by defining the event type.
You need to configure the MCP server.
You must validate settings before use.
```

### Third-Person in Description

The frontmatter description must use third person:

**Correct:**
```yaml
description: This skill should be used when the user asks to "create X", "configure Y"...
```

**Incorrect:**
```yaml
description: Use this skill when you want to create X...
description: Load this skill when user asks...
```

## Validation Checklist

Before finalizing a skill:

**Structure:**
- [ ] SKILL.md file exists with valid YAML frontmatter
- [ ] Frontmatter has `name` and `description` fields
- [ ] Markdown body is present and substantial
- [ ] Referenced files actually exist

**Description Quality:**
- [ ] Uses third person ("This skill should be used when...")
- [ ] Includes specific trigger phrases users would say
- [ ] Lists concrete scenarios ("create X", "configure Y")
- [ ] Not vague or generic

**Content Quality:**
- [ ] SKILL.md body uses imperative/infinitive form
- [ ] Body is focused and lean (1,500-2,000 words ideal, <5k max)
- [ ] Detailed content moved to references/
- [ ] Examples are complete and working
- [ ] Scripts are executable and documented

**Progressive Disclosure:**
- [ ] Core concepts in SKILL.md
- [ ] Detailed docs in references/
- [ ] Working code in examples/
- [ ] Utilities in scripts/
- [ ] SKILL.md references these resources

## Common Mistakes to Avoid

### Mistake 1: Weak Trigger Description

**Bad:**
```yaml
description: Provides guidance for working with hooks.
```

**Good:**
```yaml
description: This skill should be used when the user asks to "create a hook", "add a PreToolUse hook", "validate tool use", or mentions hook events. Provides comprehensive hooks API guidance.
```

### Mistake 2: Too Much in SKILL.md

**Bad:**
```
skill-name/
+-- SKILL.md  (8,000 words - everything in one file)
```

**Good:**
```
skill-name/
+-- SKILL.md  (1,800 words - core essentials)
+-- references/
    +-- patterns.md (2,500 words)
    +-- advanced.md (3,700 words)
```

### Mistake 3: Second Person Writing

**Bad:**
```markdown
You should start by reading the configuration file.
You need to validate the input.
```

**Good:**
```markdown
Start by reading the configuration file.
Validate the input before processing.
```

## Quick Reference

### Minimal Skill

```
skill-name/
+-- SKILL.md
```

### Standard Skill (Recommended)

```
skill-name/
+-- SKILL.md
+-- references/
|   +-- detailed-guide.md
+-- examples/
    +-- working-example.sh
```

### Complete Skill

```
skill-name/
+-- SKILL.md
+-- references/
|   +-- patterns.md
|   +-- advanced.md
+-- examples/
|   +-- example1.sh
|   +-- example2.json
+-- scripts/
    +-- validate.sh
```

## Implementation Workflow

To create a skill for a plugin:

1. **Understand use cases**: Identify concrete examples of skill usage
2. **Plan resources**: Determine what scripts/references/examples needed
3. **Create structure**: `mkdir -p skills/skill-name/{references,examples,scripts}`
4. **Write SKILL.md**:
   - Frontmatter with third-person description and trigger phrases
   - Lean body (1,500-2,000 words) in imperative form
   - Reference supporting files
5. **Add resources**: Create references/, examples/, scripts/ as needed
6. **Validate**: Check description, writing style, organization
7. **Test**: Verify skill loads on expected triggers
8. **Iterate**: Improve based on usage

Focus on strong trigger descriptions, progressive disclosure, and imperative writing style for effective skills that load when needed and provide targeted guidance.
