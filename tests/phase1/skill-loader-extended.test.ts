/**
 * Extended Skill Loader Tests
 *
 * Tests for commands/, agents/, hooks/ discovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../../src/core/skills/loader.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';

const TEST_SKILLS_PATH = join(process.cwd(), 'tests/fixtures/extended-skills');

describe('SkillLoader Extended', () => {
  beforeEach(async () => {
    // Clean up before each test
    await rm(TEST_SKILLS_PATH, { recursive: true, force: true });
  });

  describe('discoverCommands', () => {
    it('should discover commands in commands/ directory', async () => {
      // Setup: create skill with commands
      const skillPath = join(TEST_SKILLS_PATH, 'commit');
      await mkdir(join(skillPath, 'commands'), { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: commit
description: Git commit utilities
---

# Commit Skill
`
      );

      await writeFile(
        join(skillPath, 'commands', 'commit.md'),
        `---
description: Create a git commit
allowed-tools: Bash(git add:*), Bash(git commit:*)
---

## Your Task
Create a commit with conventional format.
`
      );

      await writeFile(
        join(skillPath, 'commands', 'commit-push-pr.md'),
        `---
description: Commit, push and create PR
allowed-tools: Bash(git:*), Bash(gh:*)
---

## Your Task
Full workflow: commit → push → PR.
`
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      expect(result.commands.has('commit')).toBe(true);
      const commands = result.commands.get('commit')!;
      expect(commands).toHaveLength(2);
      expect(commands.map((c) => c.name)).toContain('commit');
      expect(commands.map((c) => c.name)).toContain('commit-push-pr');
    });

    it('should handle skill without commands directory', async () => {
      const skillPath = join(TEST_SKILLS_PATH, 'frontend-design');
      await mkdir(skillPath, { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: frontend-design
description: Frontend design guidelines
---

# Design Guidelines
`
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      expect(result.commands.has('frontend-design')).toBe(false);
    });
  });

  describe('discoverAgents', () => {
    it('should discover agents in agents/ directory', async () => {
      const skillPath = join(TEST_SKILLS_PATH, 'pr-review');
      await mkdir(join(skillPath, 'agents'), { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: pr-review
description: PR review agents
---

# PR Review
`
      );

      await writeFile(
        join(skillPath, 'agents', 'code-reviewer.md'),
        `---
name: code-reviewer
description: Review code for bugs and style
model: sonnet
---

## Instructions
Review the code thoroughly.
`
      );

      await writeFile(
        join(skillPath, 'agents', 'test-analyzer.md'),
        `---
name: test-analyzer
description: Analyze test coverage
model: haiku
---

## Instructions
Check test coverage.
`
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      expect(result.agents.has('pr-review')).toBe(true);
      const agents = result.agents.get('pr-review')!;
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.name)).toContain('code-reviewer');
      expect(agents.map((a) => a.name)).toContain('test-analyzer');
      // Verify namespace isolation
      expect(agents[0].skillName).toBe('pr-review');
    });

    it('should handle agent namespace isolation', async () => {
      // Create two skills with same agent name
      const prReviewPath = join(TEST_SKILLS_PATH, 'pr-review');
      const featureDevPath = join(TEST_SKILLS_PATH, 'feature-dev');

      await mkdir(join(prReviewPath, 'agents'), { recursive: true });
      await mkdir(join(featureDevPath, 'agents'), { recursive: true });

      await writeFile(
        join(prReviewPath, 'SKILL.md'),
        `---
name: pr-review
description: PR review
---
`
      );
      await writeFile(
        join(featureDevPath, 'SKILL.md'),
        `---
name: feature-dev
description: Feature development
---
`
      );

      // Same name, different skills
      await writeFile(
        join(prReviewPath, 'agents', 'code-reviewer.md'),
        `---
name: code-reviewer
description: PR code reviewer
---

PR review instructions.
`
      );
      await writeFile(
        join(featureDevPath, 'agents', 'code-reviewer.md'),
        `---
name: code-reviewer
description: Feature code reviewer
---

Feature review instructions.
`
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      const prAgents = result.agents.get('pr-review')!;
      const featureAgents = result.agents.get('feature-dev')!;

      expect(prAgents[0].skillName).toBe('pr-review');
      expect(featureAgents[0].skillName).toBe('feature-dev');
      expect(prAgents[0].frontmatter.description).toBe('PR code reviewer');
      expect(featureAgents[0].frontmatter.description).toBe('Feature code reviewer');
    });
  });

  describe('discoverHooks', () => {
    it('should discover hooks.json in hooks/ directory', async () => {
      const skillPath = join(TEST_SKILLS_PATH, 'security');
      await mkdir(join(skillPath, 'hooks'), { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: security
description: Security hooks
---

# Security Skill
`
      );

      await writeFile(
        join(skillPath, 'hooks', 'hooks.json'),
        JSON.stringify(
          {
            description: 'Security reminder hooks',
            hooks: {
              PreToolUse: [
                {
                  matcher: 'Edit|Write|MultiEdit',
                  hooks: [
                    {
                      type: 'command',
                      command: 'python3 ${SKILL_ROOT}/hooks/security_reminder_hook.py',
                    },
                  ],
                },
              ],
            },
          },
          null,
          2
        )
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      expect(result.hooks.has('security')).toBe(true);
      const hooks = result.hooks.get('security')!;
      expect(hooks.hooks.PreToolUse).toBeDefined();
      expect(hooks.hooks.PreToolUse![0].matcher).toBe('Edit|Write|MultiEdit');
    });

    it('should handle invalid hooks.json gracefully', async () => {
      const skillPath = join(TEST_SKILLS_PATH, 'bad-hooks');
      await mkdir(join(skillPath, 'hooks'), { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: bad-hooks
description: Bad hooks test
---
`
      );

      await writeFile(join(skillPath, 'hooks', 'hooks.json'), 'invalid json {{{');

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      // Should not crash, just skip invalid hooks
      expect(result.hooks.has('bad-hooks')).toBe(false);
    });
  });

  describe('discoverAll', () => {
    it('should return complete SkillLoaderResult', async () => {
      const skillPath = join(TEST_SKILLS_PATH, 'full-skill');
      await mkdir(join(skillPath, 'commands'), { recursive: true });
      await mkdir(join(skillPath, 'agents'), { recursive: true });
      await mkdir(join(skillPath, 'hooks'), { recursive: true });

      await writeFile(
        join(skillPath, 'SKILL.md'),
        `---
name: full-skill
description: A complete skill
---

# Full Skill
`
      );

      await writeFile(
        join(skillPath, 'commands', 'test-cmd.md'),
        `---
description: Test command
---
Test content.
`
      );

      await writeFile(
        join(skillPath, 'agents', 'test-agent.md'),
        `---
name: test-agent
description: Test agent
---
Agent content.
`
      );

      await writeFile(
        join(skillPath, 'hooks', 'hooks.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [],
          },
        })
      );

      const loader = new SkillLoader(TEST_SKILLS_PATH);
      const result = await loader.discoverAll();

      expect(result.skills).toHaveLength(1);
      expect(result.commands.has('full-skill')).toBe(true);
      expect(result.agents.has('full-skill')).toBe(true);
      expect(result.hooks.has('full-skill')).toBe(true);
    });
  });
});
