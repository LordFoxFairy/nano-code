/**
 * HookRegistry Tests (Phase 2)
 *
 * Tests for registering and retrieving hooks from loaded skills
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from '../../src/core/hooks/registry.js';
import type { HooksJson, HookEventType } from '../../src/types';

describe('HookRegistry', () => {
  let registry: HookRegistry;

  const securityHooksJson: HooksJson = {
    description: 'Security reminder hook',
    hooks: {
      PreToolUse: [
        {
          hooks: [{ type: 'command', command: 'python3 security_hook.py' }],
          matcher: 'Edit|Write|MultiEdit',
        },
      ],
    },
  };

  const loggingHooksJson: HooksJson = {
    description: 'Logging hook',
    hooks: {
      PreToolUse: [
        {
          hooks: [{ type: 'command', command: 'logger.sh' }],
          matcher: '.*',
        },
      ],
      PostToolUse: [
        {
          hooks: [{ type: 'command', command: 'post_logger.sh' }],
          matcher: '.*',
        },
      ],
    },
  };

  beforeEach(() => {
    registry = new HookRegistry();
  });

  describe('registerHooks()', () => {
    it('should register hooks from a skill', () => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);

      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks.length).toBe(1);
      expect(hooks[0].skillName).toBe('security');
    });

    it('should register multiple skills', () => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      registry.registerHooks('logging', '/skills/logging', loggingHooksJson);

      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks.length).toBe(2);
    });

    it('should handle empty hooks object', () => {
      const emptyHooks: HooksJson = { hooks: {} };
      registry.registerHooks('empty', '/skills/empty', emptyHooks);

      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks.length).toBe(0);
    });

    it('should preserve skill root path', () => {
      registry.registerHooks(
        'security',
        '/path/to/skills/security',
        securityHooksJson,
      );

      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks[0].skillRoot).toBe('/path/to/skills/security');
    });
  });

  describe('getHooksForEvent()', () => {
    beforeEach(() => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      registry.registerHooks('logging', '/skills/logging', loggingHooksJson);
    });

    it('should return PreToolUse hooks', () => {
      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks.length).toBe(2);
    });

    it('should return PostToolUse hooks', () => {
      const hooks = registry.getHooksForEvent('PostToolUse');
      expect(hooks.length).toBe(1);
      expect(hooks[0].skillName).toBe('logging');
    });

    it('should return empty array for unused event types', () => {
      const hooks = registry.getHooksForEvent('SessionStart');
      expect(hooks.length).toBe(0);
    });

    it('should return hooks in registration order', () => {
      const hooks = registry.getHooksForEvent('PreToolUse');
      expect(hooks[0].skillName).toBe('security');
      expect(hooks[1].skillName).toBe('logging');
    });
  });

  describe('getHooksForTool()', () => {
    beforeEach(() => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      registry.registerHooks('logging', '/skills/logging', loggingHooksJson);
    });

    it('should return matching hooks for Edit tool', () => {
      const hooks = registry.getHooksForTool('PreToolUse', 'Edit');
      expect(hooks.length).toBe(2); // security (Edit|Write) + logging (.*)
    });

    it('should return only wildcard hooks for Read tool', () => {
      const hooks = registry.getHooksForTool('PreToolUse', 'Read');
      expect(hooks.length).toBe(1); // Only logging (.*)
      expect(hooks[0].skillName).toBe('logging');
    });

    it('should return empty for unmatched event type', () => {
      const hooks = registry.getHooksForTool('SessionStart', 'Edit');
      expect(hooks.length).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all registered hooks', () => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      expect(registry.getHooksForEvent('PreToolUse').length).toBe(1);

      registry.clear();

      expect(registry.getHooksForEvent('PreToolUse').length).toBe(0);
    });
  });

  describe('hasHooksForEvent()', () => {
    it('should return true when hooks exist', () => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      expect(registry.hasHooksForEvent('PreToolUse')).toBe(true);
    });

    it('should return false when no hooks', () => {
      expect(registry.hasHooksForEvent('PreToolUse')).toBe(false);
    });

    it('should return false for unregistered event type', () => {
      registry.registerHooks('security', '/skills/security', securityHooksJson);
      expect(registry.hasHooksForEvent('SessionStart')).toBe(false);
    });
  });
});
