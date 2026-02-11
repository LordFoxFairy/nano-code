/**
 * SemanticRouter Tests (Phase 1.1)
 *
 * Tests LLM-based intent recognition for auto skill activation.
 * Uses mock LLM provider for deterministic testing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SemanticRouter } from '../../src/core/routing/semantic-router.js';
import type { Skill, LLMProvider, SkillMatch } from '../../src/types/index.js';

// Mock LLM Provider for testing
class MockLLMProvider implements LLMProvider {
  private responses: Map<string, string> = new Map();

  setResponse(pattern: string, response: string) {
    this.responses.set(pattern, response);
  }

  async complete(prompt: string): Promise<string> {
    // Find matching response based on prompt content
    for (const [pattern, response] of this.responses) {
      if (prompt.includes(pattern)) {
        return response;
      }
    }
    // Default: no match
    return JSON.stringify({ skill: null, confidence: 0, reason: 'No match found' });
  }
}

describe('SemanticRouter', () => {
  let router: SemanticRouter;
  let mockLLM: MockLLMProvider;

  const frontendSkill: Skill = {
    name: 'frontend-design',
    path: '/skills/frontend-design',
    frontmatter: {
      name: 'frontend-design',
      description: 'This skill should be used when designing frontend UI components, layouts, or user interfaces.',
    },
    content: '# Frontend Design\n\nDesign system guidelines...',
  };

  const commitSkill: Skill = {
    name: 'commit',
    path: '/skills/commit',
    frontmatter: {
      name: 'commit',
      description: 'This skill should be used when creating git commits.',
      'disable-model-invocation': true, // User-invocable only
    },
    content: '# Commit\n\nCreate commits...',
  };

  const securitySkill: Skill = {
    name: 'security',
    path: '/skills/security',
    frontmatter: {
      name: 'security',
      description: 'This skill should be used when reviewing code for security vulnerabilities.',
    },
    content: '# Security\n\nSecurity checks...',
  };

  const skills: Skill[] = [frontendSkill, commitSkill, securitySkill];

  beforeEach(() => {
    mockLLM = new MockLLMProvider();
    router = new SemanticRouter({ llmProvider: mockLLM });
  });

  describe('match()', () => {
    it('should match frontend skill for UI design request', async () => {
      mockLLM.setResponse('design a login page', JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.95,
        reason: 'User wants to design a frontend UI component',
      }));

      const result = await router.match('Please design a login page', skills);

      expect(result).not.toBeNull();
      expect(result?.skill.name).toBe('frontend-design');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should match security skill for vulnerability review', async () => {
      mockLLM.setResponse('security vulnerabilities', JSON.stringify({
        skill: 'security',
        confidence: 0.92,
        reason: 'User wants security review',
      }));

      const result = await router.match('Check for security vulnerabilities', skills);

      expect(result).not.toBeNull();
      expect(result?.skill.name).toBe('security');
    });

    it('should return null for unrelated input', async () => {
      mockLLM.setResponse('weather', JSON.stringify({
        skill: null,
        confidence: 0,
        reason: 'No relevant skill found',
      }));

      const result = await router.match("What's the weather like?", skills);

      expect(result).toBeNull();
    });

    it('should respect confidence threshold', async () => {
      router = new SemanticRouter({
        llmProvider: mockLLM,
        confidenceThreshold: 0.8,
      });

      mockLLM.setResponse('maybe frontend', JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.6, // Below threshold
        reason: 'Low confidence match',
      }));

      const result = await router.match('maybe frontend related', skills);

      expect(result).toBeNull();
    });

    it('should skip skills with disable-model-invocation', async () => {
      // Even if LLM matches commit, it should be skipped
      mockLLM.setResponse('commit', JSON.stringify({
        skill: 'commit',
        confidence: 0.99,
        reason: 'User wants to commit',
      }));

      const result = await router.match('commit my changes', skills);

      // Should not match because commit has disable-model-invocation: true
      expect(result).toBeNull();
    });
  });

  describe('route()', () => {
    it('should return full decision with reasoning', async () => {
      mockLLM.setResponse('dashboard', JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.88,
        reason: 'Dashboard is a UI component',
      }));

      const decision = await router.route('Create a dashboard', skills);

      expect(decision.shouldActivate).toBe(true);
      expect(decision.match?.skill.name).toBe('frontend-design');
      expect(decision.reasoning).toBeDefined();
    });

    it('should not activate for low confidence', async () => {
      mockLLM.setResponse('unclear', JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.3,
        reason: 'Unclear intent',
      }));

      const decision = await router.route('something unclear', skills);

      expect(decision.shouldActivate).toBe(false);
      expect(decision.match).toBeNull();
    });
  });

  describe('getAutoSkills()', () => {
    it('should filter out user-invocable skills', () => {
      const autoSkills = router.getAutoSkills(skills);

      expect(autoSkills).toHaveLength(2);
      expect(autoSkills.map((s) => s.name)).toContain('frontend-design');
      expect(autoSkills.map((s) => s.name)).toContain('security');
      expect(autoSkills.map((s) => s.name)).not.toContain('commit');
    });
  });

  describe('buildMatchPrompt()', () => {
    it('should include skill descriptions in prompt', () => {
      const prompt = router.buildMatchPrompt('design a page', skills);

      expect(prompt).toContain('frontend-design');
      expect(prompt).toContain('designing frontend UI');
      expect(prompt).toContain('security vulnerabilities');
      // Should not include user-invocable skills
      expect(prompt).not.toContain('creating git commits');
    });

    it('should include user input in prompt', () => {
      const prompt = router.buildMatchPrompt('design a login form', skills);

      expect(prompt).toContain('design a login form');
    });
  });

  describe('parseResponse()', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.9,
        reason: 'Test reason',
      });

      const parsed = router.parseResponse(response, skills);

      expect(parsed?.skill.name).toBe('frontend-design');
      expect(parsed?.confidence).toBe(0.9);
      expect(parsed?.reason).toBe('Test reason');
    });

    it('should handle malformed JSON gracefully', () => {
      const parsed = router.parseResponse('not valid json', skills);

      expect(parsed).toBeNull();
    });

    it('should handle null skill in response', () => {
      const response = JSON.stringify({
        skill: null,
        confidence: 0,
        reason: 'No match',
      });

      const parsed = router.parseResponse(response, skills);

      expect(parsed).toBeNull();
    });

    it('should handle unknown skill name', () => {
      const response = JSON.stringify({
        skill: 'unknown-skill',
        confidence: 0.9,
        reason: 'Test',
      });

      const parsed = router.parseResponse(response, skills);

      expect(parsed).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty skills array', async () => {
      const result = await router.match('design something', []);

      expect(result).toBeNull();
    });

    it('should handle empty input', async () => {
      const result = await router.match('', skills);

      expect(result).toBeNull();
    });

    it('should handle LLM error gracefully', async () => {
      const errorLLM: LLMProvider = {
        async complete() {
          throw new Error('LLM service unavailable');
        },
      };

      router = new SemanticRouter({ llmProvider: errorLLM });

      const result = await router.match('design a page', skills);

      expect(result).toBeNull();
    });

    it('should work without LLM provider (fallback mode)', async () => {
      router = new SemanticRouter(); // No LLM provider

      const result = await router.match('design a page', skills);

      // In fallback mode, should return null (no semantic matching)
      expect(result).toBeNull();
    });
  });

  describe('Chinese input', () => {
    it('should match frontend skill for Chinese input', async () => {
      mockLLM.setResponse('电商首页', JSON.stringify({
        skill: 'frontend-design',
        confidence: 0.91,
        reason: '用户想要设计一个电商首页UI',
      }));

      const result = await router.match('帮我做一个电商首页', skills);

      expect(result).not.toBeNull();
      expect(result?.skill.name).toBe('frontend-design');
    });
  });
});
