import { describe, it, expect } from 'vitest';
import { PromptInjector } from '../../src/core/skills/prompt-injector.js';
import type { Skill } from '../../src/types/index.js';

describe('PromptInjector', () => {
  const createMockSkill = (name: string, content: string, description = ''): Skill => ({
    name,
    path: `/mock/path/${name}/SKILL.md`,
    frontmatter: {
      name,
      description: description || `Description for ${name}`,
    },
    content,
  });

  describe('injectSkill', () => {
    it('should inject skill content directly (Claude Code style)', () => {
      const injector = new PromptInjector();
      const skill = createMockSkill('test-skill', '# Test Content\n\nThis is test content.');
      const basePrompt = 'You are a helpful assistant.';

      const result = injector.injectSkill(basePrompt, skill);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('# Test Content');
      expect(result).toContain('This is test content.');
      // Should NOT have custom wrapper format
      expect(result).not.toContain('--- Skill:');
      expect(result).not.toContain('--- End Skill:');
    });

    it('should inject skill content without wrapper', () => {
      const injector = new PromptInjector();
      const skill = createMockSkill('frontend-design', 'Design guidelines here.');
      const basePrompt = 'Base prompt.';

      const result = injector.injectSkill(basePrompt, skill);

      expect(result).toContain('Design guidelines here.');
      // Direct injection, no metadata duplication
      expect(result).not.toContain('Description:');
    });

    it('should handle empty base prompt', () => {
      const injector = new PromptInjector();
      const skill = createMockSkill('test', 'Content');

      const result = injector.injectSkill('', skill);

      expect(result).toBe('Content');
    });

    it('should handle empty skill content', () => {
      const injector = new PromptInjector();
      const skill = createMockSkill('empty', '');
      const basePrompt = 'Base prompt.';

      const result = injector.injectSkill(basePrompt, skill);

      expect(result).toBe('Base prompt.');
    });
  });

  describe('injectMultipleSkills', () => {
    it('should inject multiple skills directly', () => {
      const injector = new PromptInjector();
      const skills = [
        createMockSkill('skill-1', 'Content 1'),
        createMockSkill('skill-2', 'Content 2'),
      ];
      const basePrompt = 'Base prompt.';

      const result = injector.injectMultipleSkills(basePrompt, skills);

      expect(result).toContain('Content 1');
      expect(result).toContain('Content 2');
      expect(result).toContain('Base prompt.');
    });

    it('should handle empty skills array', () => {
      const injector = new PromptInjector();
      const basePrompt = 'Base prompt.';

      const result = injector.injectMultipleSkills(basePrompt, []);

      expect(result).toBe('Base prompt.');
    });

    it('should filter out skills with empty content', () => {
      const injector = new PromptInjector();
      const skills = [
        createMockSkill('skill-1', 'Content 1'),
        createMockSkill('empty', ''),
        createMockSkill('skill-2', 'Content 2'),
      ];

      const result = injector.injectMultipleSkills('', skills);

      expect(result).toContain('Content 1');
      expect(result).toContain('Content 2');
    });
  });

  describe('injectSkillMetadata (L1 - Progressive Disclosure)', () => {
    it('should inject only metadata for L1 level', () => {
      const injector = new PromptInjector();
      const skills = [
        createMockSkill('commit', 'Full content here', 'Create git commits'),
        createMockSkill('review', 'Review content', 'Review code changes'),
      ];

      const result = injector.injectSkillMetadata('Base.', skills);

      expect(result).toContain('Available Skills:');
      expect(result).toContain('- commit: Create git commits');
      expect(result).toContain('- review: Review code changes');
      // Should NOT contain full content
      expect(result).not.toContain('Full content here');
      expect(result).not.toContain('Review content');
    });

    it('should handle empty skills array', () => {
      const injector = new PromptInjector();

      const result = injector.injectSkillMetadata('Base.', []);

      expect(result).toBe('Base.');
    });

    it('should handle empty base prompt', () => {
      const injector = new PromptInjector();
      const skills = [createMockSkill('test', 'Content', 'Test skill')];

      const result = injector.injectSkillMetadata('', skills);

      expect(result).toContain('Available Skills:');
      expect(result).toContain('- test: Test skill');
    });
  });
});
