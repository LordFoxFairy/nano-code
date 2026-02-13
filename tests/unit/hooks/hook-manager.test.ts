import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HookManager,
  getHookManager,
  initializeHookManager,
  resetHookManager,
  type HookDefinition,
  type HooksConfig,
} from '../../../src/hooks';

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    resetHookManager();
    manager = new HookManager({ debug: false });
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const mgr = new HookManager();
      expect(mgr).toBeDefined();
      expect(mgr.getContext().sessionId).toBeDefined();
    });

    it('should initialize empty hook groups for all event types', () => {
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
      expect(Object.keys(stats.byEvent)).toContain('PreToolUse');
      expect(Object.keys(stats.byEvent)).toContain('PostToolUse');
      expect(Object.keys(stats.byEvent)).toContain('SessionStart');
    });
  });

  describe('addHook', () => {
    it('should add a single hook', () => {
      manager.addHook('PreToolUse', {
        type: 'command',
        command: 'echo "test"',
      });

      const stats = manager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byEvent['PreToolUse']).toBe(1);
    });

    it('should add hook with matcher', () => {
      manager.addHook(
        'PreToolUse',
        {
          type: 'command',
          command: 'echo "test"',
        },
        'Write|Edit',
      );

      const hooks = manager.getHooks('PreToolUse');
      expect(hooks.length).toBe(1);
      expect(hooks[0]?.matcher).toBe('Write|Edit');
    });
  });

  describe('addHookGroup', () => {
    it('should add a hook group', () => {
      manager.addHookGroup('PreToolUse', {
        hooks: [
          { type: 'command', command: 'echo "hook1"' },
          { type: 'command', command: 'echo "hook2"' },
        ],
        matcher: 'Bash',
      });

      const stats = manager.getStats();
      expect(stats.total).toBe(2);
    });
  });

  describe('removeHook', () => {
    it('should remove a hook by ID', () => {
      const hookId = 'test-hook-123';
      manager.addHook('PreToolUse', {
        id: hookId,
        type: 'command',
        command: 'echo "test"',
      });

      expect(manager.getStats().total).toBe(1);

      const removed = manager.removeHook(hookId);
      expect(removed).toBe(true);
      expect(manager.getStats().total).toBe(0);
    });

    it('should return false if hook not found', () => {
      const removed = manager.removeHook('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('loadFromConfig', () => {
    it('should load hooks from config object', () => {
      const config: HooksConfig = {
        description: 'Test hooks',
        hooks: {
          PreToolUse: [
            {
              hooks: [{ type: 'command', command: 'echo "pre"' }],
              matcher: 'Write',
            },
          ],
          PostToolUse: [
            {
              hooks: [{ type: 'command', command: 'echo "post"' }],
            },
          ],
        },
      };

      manager.loadFromConfig(config);

      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byEvent['PreToolUse']).toBe(1);
      expect(stats.byEvent['PostToolUse']).toBe(1);
    });
  });

  describe('executeHooks', () => {
    it('should return success for no matching hooks', async () => {
      const result = await manager.preToolUse('SomeTool', {});

      expect(result.allPassed).toBe(true);
      expect(result.continue).toBe(true);
      expect(result.results.length).toBe(0);
    });

    it('should execute command hook and get result', async () => {
      // Add a simple echo hook that outputs JSON
      manager.addHook('PreToolUse', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });

      const result = await manager.preToolUse('Write', { path: '/test' });

      expect(result.results.length).toBe(1);
      expect(result.continue).toBe(true);
    });

    it('should respect matcher for tool filtering', async () => {
      manager.addHook(
        'PreToolUse',
        {
          type: 'command',
          command: 'echo \'{"continue": false}\'',
        },
        'Edit|Write',
      );

      // Should not match
      const result1 = await manager.preToolUse('Read', {});
      expect(result1.results.length).toBe(0);

      // Should match
      const result2 = await manager.preToolUse('Write', {});
      expect(result2.results.length).toBe(1);
    });

    it('should handle once flag', async () => {
      manager.addHook('SessionStart', {
        id: 'once-hook',
        type: 'command',
        command: 'echo \'{"continue": true}\'',
        once: true,
      });

      // First execution
      const result1 = await manager.sessionStart();
      expect(result1.results.length).toBe(1);

      // Second execution - should skip
      const result2 = await manager.sessionStart();
      expect(result2.results.length).toBe(0);
    });

    it('should handle disabled hooks', async () => {
      manager.addHook('PreToolUse', {
        type: 'command',
        command: 'echo "test"',
        enabled: false,
      });

      const result = await manager.preToolUse('Write', {});
      expect(result.results.length).toBe(0);
    });
  });

  describe('context management', () => {
    it('should update context', () => {
      manager.updateContext({
        cwd: '/new/path',
        projectDir: '/project',
      });

      const context = manager.getContext();
      expect(context.cwd).toBe('/new/path');
      expect(context.projectDir).toBe('/project');
    });
  });

  describe('global instance', () => {
    it('should return same instance from getHookManager', () => {
      const mgr1 = getHookManager();
      const mgr2 = getHookManager();
      expect(mgr1).toBe(mgr2);
    });

    it('should create new instance with initializeHookManager', () => {
      const mgr1 = getHookManager();
      const mgr2 = initializeHookManager({ debug: true });
      expect(mgr1).not.toBe(mgr2);
    });
  });

  describe('prompt hooks', () => {
    it('should execute prompt hook with LLM callback', async () => {
      const llmCallback = vi.fn().mockResolvedValue('{"continue": true}');
      manager.setLLMCallback(llmCallback);

      manager.addHook('Stop', {
        type: 'prompt',
        prompt: 'Should this stop? Reason: $STOP_REASON',
      });

      const result = await manager.stop('Task completed');

      expect(llmCallback).toHaveBeenCalled();
      expect(result.results.length).toBe(1);
      expect(result.continue).toBe(true);
    });

    it('should fail prompt hook without LLM callback', async () => {
      manager.addHook('Stop', {
        type: 'prompt',
        prompt: 'Test prompt',
      });

      const result = await manager.stop();

      expect(result.results[0]?.success).toBe(false);
      expect(result.results[0]?.error).toContain('No LLM callback');
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      manager.addHook('PreToolUse', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('PostToolUse', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('UserPromptSubmit', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('Stop', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('SessionStart', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('SessionEnd', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('PreCompact', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
      manager.addHook('Notification', {
        type: 'command',
        command: 'echo \'{"continue": true}\'',
      });
    });

    it('should execute preToolUse', async () => {
      const result = await manager.preToolUse('Write', { path: '/test' });
      expect(result.event).toBe('PreToolUse');
    });

    it('should execute postToolUse', async () => {
      const result = await manager.postToolUse('Write', { path: '/test' }, 'success');
      expect(result.event).toBe('PostToolUse');
    });

    it('should execute userPromptSubmit', async () => {
      const result = await manager.userPromptSubmit('Hello');
      expect(result.event).toBe('UserPromptSubmit');
    });

    it('should execute stop', async () => {
      const result = await manager.stop('Done');
      expect(result.event).toBe('Stop');
    });

    it('should execute sessionStart', async () => {
      const result = await manager.sessionStart();
      expect(result.event).toBe('SessionStart');
    });

    it('should execute sessionEnd', async () => {
      const result = await manager.sessionEnd(5000);
      expect(result.event).toBe('SessionEnd');
    });

    it('should execute preCompact', async () => {
      const result = await manager.preCompact(50000, 100000);
      expect(result.event).toBe('PreCompact');
    });

    it('should execute notification', async () => {
      const result = await manager.notification('info', 'Test message');
      expect(result.event).toBe('Notification');
    });
  });

  describe('clear', () => {
    it('should clear all hooks', () => {
      manager.addHook('PreToolUse', { type: 'command', command: 'echo' });
      manager.addHook('PostToolUse', { type: 'command', command: 'echo' });

      expect(manager.getStats().total).toBe(2);

      manager.clear();

      expect(manager.getStats().total).toBe(0);
    });
  });
});
