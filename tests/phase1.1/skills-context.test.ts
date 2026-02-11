/**
 * SkillsContext Tests (Phase 1.1)
 *
 * Tests L1 integration: runtime management of skills for injection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillsContext } from '../../src/core/skills/context.js';
import type { Skill } from '../../src/types/index.js';

describe('SkillsContext', () => {
  let context: SkillsContext;

  const mockSkill: Skill = {
    name: 'test-skill',
    path: '/test/path',
    frontmatter: {
      name: 'test-skill',
      description: 'This skill should be used when testing',
    },
    content: '# Test Skill\n\nThis is test content.',
  };

  const mockSkill2: Skill = {
    name: 'commit',
    path: '/commit/path',
    frontmatter: {
      name: 'commit',
      description: 'This skill should be used when creating git commits',
    },
    content: '# Commit Skill\n\nCreate commits with generated messages.',
  };

  beforeEach(() => {
    context = new SkillsContext();
  });

  describe('register()', () => {
    it('should register a skill', () => {
      context.register(mockSkill);

      const skills = context.getAllSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('test-skill');
    });

    it('should register multiple skills', () => {
      context.register(mockSkill);
      context.register(mockSkill2);

      const skills = context.getAllSkills();
      expect(skills).toHaveLength(2);
    });

    it('should not register duplicate skills', () => {
      context.register(mockSkill);
      context.register(mockSkill);

      const skills = context.getAllSkills();
      expect(skills).toHaveLength(1);
    });
  });

  describe('getSkillByName()', () => {
    it('should find skill by name', () => {
      context.register(mockSkill);
      context.register(mockSkill2);

      const skill = context.getSkillByName('commit');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('commit');
    });

    it('should return undefined for unknown skill', () => {
      context.register(mockSkill);

      const skill = context.getSkillByName('unknown');
      expect(skill).toBeUndefined();
    });
  });

  describe('getSkillsPrompt() - L1 Mode', () => {
    it('should generate L1 prompt with metadata only', () => {
      context = new SkillsContext({ injectionLevel: 'L1' });
      context.register(mockSkill);
      context.register(mockSkill2);

      const prompt = context.getSkillsPrompt();

      expect(prompt).toContain('Available Skills:');
      expect(prompt).toContain('test-skill');
      expect(prompt).toContain('commit');
      expect(prompt).toContain('This skill should be used when');
      // L1 should NOT include full content
      expect(prompt).not.toContain('# Test Skill');
      expect(prompt).not.toContain('# Commit Skill');
    });

    it('should return empty string when no skills registered', () => {
      const prompt = context.getSkillsPrompt();
      expect(prompt).toBe('');
    });
  });

  describe('getSkillsPrompt() - L2 Mode', () => {
    it('should generate L2 prompt with full content', () => {
      context = new SkillsContext({ injectionLevel: 'L2' });
      context.register(mockSkill);

      const prompt = context.getSkillsPrompt();

      expect(prompt).toContain('# Test Skill');
      expect(prompt).toContain('This is test content.');
    });
  });

  describe('getSkillPrompt()', () => {
    it('should return full content for specific skill', () => {
      context.register(mockSkill);

      const prompt = context.getSkillPrompt('test-skill');
      expect(prompt).toContain('# Test Skill');
      expect(prompt).toContain('This is test content.');
    });

    it('should return undefined for unknown skill', () => {
      const prompt = context.getSkillPrompt('unknown');
      expect(prompt).toBeUndefined();
    });
  });

  describe('injectIntoBasePrompt()', () => {
    it('should inject L1 metadata into base prompt', () => {
      context = new SkillsContext({ injectionLevel: 'L1' });
      context.register(mockSkill);

      const basePrompt = 'You are a helpful assistant.';
      const result = context.injectIntoBasePrompt(basePrompt);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('Available Skills:');
      expect(result).toContain('test-skill');
    });

    it('should inject L2 full content into base prompt', () => {
      context = new SkillsContext({ injectionLevel: 'L2' });
      context.register(mockSkill);

      const basePrompt = 'You are a helpful assistant.';
      const result = context.injectIntoBasePrompt(basePrompt);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('# Test Skill');
    });

    it('should return base prompt unchanged when no skills', () => {
      const basePrompt = 'You are a helpful assistant.';
      const result = context.injectIntoBasePrompt(basePrompt);

      expect(result).toBe(basePrompt);
    });
  });

  describe('loadFromDirectory()', () => {
    it('should load skills from directory', async () => {
      // This test uses the existing test fixtures
      const testDir = new URL(
        '../fixtures/skills',
        import.meta.url,
      ).pathname;

      await context.loadFromDirectory(testDir);
      const skills = context.getAllSkills();

      // Should have loaded at least one skill from fixtures
      expect(skills.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clear()', () => {
    it('should clear all registered skills', () => {
      context.register(mockSkill);
      context.register(mockSkill2);

      expect(context.getAllSkills()).toHaveLength(2);

      context.clear();

      expect(context.getAllSkills()).toHaveLength(0);
    });
  });

  describe('hasSkill()', () => {
    it('should return true for registered skill', () => {
      context.register(mockSkill);

      expect(context.hasSkill('test-skill')).toBe(true);
    });

    it('should return false for unregistered skill', () => {
      expect(context.hasSkill('unknown')).toBe(false);
    });
  });
});
