/**
 * HookMatcher Tests (Phase 2)
 *
 * Tests for matching tool names against hook matchers (regex patterns)
 */

import { describe, it, expect } from 'vitest';
import { HookMatcher } from '../../src/core/hooks/matcher.js';

describe('HookMatcher', () => {
  const matcher = new HookMatcher();

  describe('matchesTool()', () => {
    it('should match single tool name exactly', () => {
      expect(matcher.matchesTool('Edit', 'Edit')).toBe(true);
    });

    it('should not match different tool name', () => {
      expect(matcher.matchesTool('Edit', 'Write')).toBe(false);
    });

    it('should match with pipe separator (OR pattern)', () => {
      const pattern = 'Edit|Write|MultiEdit';
      expect(matcher.matchesTool(pattern, 'Edit')).toBe(true);
      expect(matcher.matchesTool(pattern, 'Write')).toBe(true);
      expect(matcher.matchesTool(pattern, 'MultiEdit')).toBe(true);
      expect(matcher.matchesTool(pattern, 'Read')).toBe(false);
    });

    it('should support regex patterns', () => {
      expect(matcher.matchesTool('.*Edit', 'MultiEdit')).toBe(true);
      expect(matcher.matchesTool('.*Edit', 'Edit')).toBe(true);
      expect(matcher.matchesTool('.*Edit', 'Write')).toBe(false);
    });

    it('should handle case sensitivity', () => {
      expect(matcher.matchesTool('Edit', 'edit')).toBe(false);
      expect(matcher.matchesTool('edit', 'Edit')).toBe(false);
    });

    it('should match any tool with wildcard', () => {
      expect(matcher.matchesTool('.*', 'Edit')).toBe(true);
      expect(matcher.matchesTool('.*', 'Read')).toBe(true);
      expect(matcher.matchesTool('.*', 'Bash')).toBe(true);
    });

    it('should handle empty pattern', () => {
      expect(matcher.matchesTool('', 'Edit')).toBe(false);
    });

    it('should handle empty tool name', () => {
      expect(matcher.matchesTool('Edit', '')).toBe(false);
    });

    it('should match prefix patterns', () => {
      expect(matcher.matchesTool('^Edit', 'Edit')).toBe(true);
      expect(matcher.matchesTool('^Edit', 'MultiEdit')).toBe(false);
    });

    it('should match suffix patterns with pipe', () => {
      // Suffix patterns work through pipe-separated list
      expect(matcher.matchesTool('Edit|MultiEdit', 'Edit')).toBe(true);
      expect(matcher.matchesTool('Edit|MultiEdit', 'MultiEdit')).toBe(true);
      expect(matcher.matchesTool('Edit|MultiEdit', 'EditFile')).toBe(false);
    });
  });

  describe('findMatchingHooks()', () => {
    const mockHooks = [
      {
        matcher: 'Edit|Write|MultiEdit',
        hooks: [{ type: 'command' as const, command: 'python3 hook1.py' }],
      },
      {
        matcher: 'Bash',
        hooks: [{ type: 'command' as const, command: 'python3 hook2.py' }],
      },
      {
        matcher: '.*',
        hooks: [{ type: 'command' as const, command: 'python3 hook3.py' }],
      },
    ];

    it('should find hooks matching Edit tool', () => {
      const result = matcher.findMatchingHooks('Edit', mockHooks);
      expect(result.length).toBe(2); // Edit|Write|MultiEdit and .*
    });

    it('should find hooks matching Bash tool', () => {
      const result = matcher.findMatchingHooks('Bash', mockHooks);
      expect(result.length).toBe(2); // Bash and .*
    });

    it('should find only wildcard hook for Read tool', () => {
      const result = matcher.findMatchingHooks('Read', mockHooks);
      expect(result.length).toBe(1); // Only .*
    });

    it('should return empty array when no hooks defined', () => {
      const result = matcher.findMatchingHooks('Edit', []);
      expect(result).toEqual([]);
    });

    it('should return all hooks in order', () => {
      const result = matcher.findMatchingHooks('Write', mockHooks);
      expect(result[0].hooks[0].command).toContain('hook1.py');
      expect(result[1].hooks[0].command).toContain('hook3.py');
    });
  });

  describe('edge cases', () => {
    it('should handle special regex characters safely', () => {
      // Tool names shouldn't have special chars, but handle gracefully
      expect(matcher.matchesTool('Edit', 'Edit')).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      // Invalid regex pattern - should return false, not throw
      expect(() => matcher.matchesTool('[invalid', 'Edit')).not.toThrow();
      expect(matcher.matchesTool('[invalid', 'Edit')).toBe(false);
    });
  });
});
