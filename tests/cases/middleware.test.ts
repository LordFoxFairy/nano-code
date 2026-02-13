import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createToolHooksMiddleware,
  getToolHooksState,
  securityValidationHook,
  createRateLimitHook,
  truncateResultHook,
  addMetadataHook,
  type PreToolUseHook,
  type PostToolUseHook,
} from '../../src/middleware/tool-hooks.js';
import {
  isToolAllowed,
  filterTools,
  createToolRestrictionMiddleware,
  parseAllowedTools,
} from '../../src/middleware/tool-restriction.js';
import {
  runStopValidationChecks,
  allValidationsPassed,
  formatValidationResults,
} from '../../src/middleware/stop-validation.js';

describe('Tool Hooks Middleware', () => {
  beforeEach(() => {
    // Clear logs before each test
    getToolHooksState().clearLogs();
  });

  describe('PreToolUse Hooks', () => {
    it('should allow execution when no hooks are configured', async () => {
      const middleware = createToolHooksMiddleware({});
      const execute = vi.fn().mockResolvedValue('success');

      const result = await middleware('TestTool', { arg: 'value' }, execute);

      expect(result).toBe('success');
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should block execution when pre-hook returns allowed: false', async () => {
      const blockingHook: PreToolUseHook = async () => ({
        allowed: false,
        reason: 'Blocked by test',
      });

      const middleware = createToolHooksMiddleware({
        preToolUse: [blockingHook],
      });
      const execute = vi.fn().mockResolvedValue('success');

      const result = await middleware('TestTool', { arg: 'value' }, execute);

      expect(result).toBe('Error: Blocked by test');
      expect(execute).not.toHaveBeenCalled();
    });

    it('should run multiple pre-hooks in order', async () => {
      const callOrder: string[] = [];

      const hook1: PreToolUseHook = async () => {
        callOrder.push('hook1');
        return { allowed: true };
      };

      const hook2: PreToolUseHook = async () => {
        callOrder.push('hook2');
        return { allowed: true };
      };

      const middleware = createToolHooksMiddleware({
        preToolUse: [hook1, hook2],
      });

      await middleware('TestTool', {}, vi.fn().mockResolvedValue('success'));

      expect(callOrder).toEqual(['hook1', 'hook2']);
    });

    it('should allow pre-hooks to modify arguments', async () => {
      const modifyingHook: PreToolUseHook = async (_toolName, args) => ({
        allowed: true,
        modifiedArgs: { ...args, injected: 'value' },
      });

      const middleware = createToolHooksMiddleware({
        preToolUse: [modifyingHook],
      });

      let capturedArgs: Record<string, unknown> | null = null;
      const execute = vi.fn().mockImplementation(async () => {
        // Note: execute doesn't receive modified args directly,
        // but the middleware tracks them for logging
        return 'success';
      });

      await middleware('TestTool', { original: 'arg' }, execute);

      expect(execute).toHaveBeenCalled();
    });
  });

  describe('PostToolUse Hooks', () => {
    it('should run post-hooks after execution', async () => {
      const postHook: PostToolUseHook = async (_toolName, _args, result) => {
        return `${result}-modified`;
      };

      const middleware = createToolHooksMiddleware({
        postToolUse: [postHook],
      });

      const result = await middleware('TestTool', {}, vi.fn().mockResolvedValue('original'));

      expect(result).toBe('original-modified');
    });

    it('should chain multiple post-hooks', async () => {
      const hook1: PostToolUseHook = async (_t, _a, result) => `${result}-1`;
      const hook2: PostToolUseHook = async (_t, _a, result) => `${result}-2`;

      const middleware = createToolHooksMiddleware({
        postToolUse: [hook1, hook2],
      });

      const result = await middleware('TestTool', {}, vi.fn().mockResolvedValue('start'));

      expect(result).toBe('start-1-2');
    });
  });

  describe('Logging', () => {
    it('should log tool calls when enabled', async () => {
      const middleware = createToolHooksMiddleware({
        enableLogging: true,
      });

      await middleware('TestTool', { arg: 'value' }, vi.fn().mockResolvedValue('result'));

      const logs = getToolHooksState().getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        toolName: 'TestTool',
        args: { arg: 'value' },
        success: true,
        result: 'result',
      });
    });

    it('should log failed tool calls', async () => {
      const middleware = createToolHooksMiddleware({
        enableLogging: true,
      });

      await middleware('TestTool', {}, vi.fn().mockRejectedValue(new Error('Test error')));

      const logs = getToolHooksState().getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        toolName: 'TestTool',
        success: false,
        error: 'Test error',
      });
    });

    it('should track statistics', async () => {
      const middleware = createToolHooksMiddleware({
        enableLogging: true,
      });

      await middleware('Tool1', {}, vi.fn().mockResolvedValue('ok'));
      await middleware('Tool2', {}, vi.fn().mockResolvedValue('ok'));
      await middleware('Tool3', {}, vi.fn().mockRejectedValue(new Error('fail')));

      const stats = getToolHooksState().getStats();
      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
    });
  });

  describe('Error Recovery', () => {
    it('should use custom error handler when provided', async () => {
      const middleware = createToolHooksMiddleware({
        onError: async () => 'recovered-value',
      });

      const result = await middleware(
        'TestTool',
        {},
        vi.fn().mockRejectedValue(new Error('Original error')),
      );

      expect(result).toBe('recovered-value');
    });

    it('should return error message when handler returns null', async () => {
      const middleware = createToolHooksMiddleware({
        onError: async () => null,
      });

      const result = await middleware(
        'TestTool',
        {},
        vi.fn().mockRejectedValue(new Error('Test error')),
      );

      expect(result).toBe('Error: Test error');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      let attempts = 0;
      const execute = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('TIMEOUT: Connection failed');
        }
        return 'success';
      });

      const middleware = createToolHooksMiddleware({
        retry: {
          maxRetries: 3,
          retryDelay: 10,
          retryableErrors: ['TIMEOUT'],
        },
      });

      const result = await middleware('TestTool', {}, execute);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('Permission denied'));

      const middleware = createToolHooksMiddleware({
        retry: {
          maxRetries: 3,
          retryDelay: 10,
          retryableErrors: ['TIMEOUT'],
        },
      });

      const result = await middleware('TestTool', {}, execute);

      expect(result).toBe('Error: Permission denied');
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Built-in Hooks', () => {
    describe('securityValidationHook', () => {
      it('should block dangerous rm command', async () => {
        const result = await securityValidationHook('Bash', { command: 'rm -rf /' });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Dangerous command blocked');
      });

      it('should block fork bomb', async () => {
        const result = await securityValidationHook('execute', { cmd: ':(){ :|:& };:' });
        expect(result.allowed).toBe(false);
      });

      it('should allow safe commands', async () => {
        const result = await securityValidationHook('Bash', { command: 'ls -la' });
        expect(result.allowed).toBe(true);
      });

      it('should allow non-Bash tools', async () => {
        const result = await securityValidationHook('Read', { file: '/etc/passwd' });
        expect(result.allowed).toBe(true);
      });
    });

    describe('createRateLimitHook', () => {
      it('should allow calls within rate limit', async () => {
        const hook = createRateLimitHook(5);

        for (let i = 0; i < 5; i++) {
          const result = await hook('TestTool', {});
          expect(result.allowed).toBe(true);
        }
      });

      it('should block calls exceeding rate limit', async () => {
        const hook = createRateLimitHook(3);

        await hook('TestTool', {});
        await hook('TestTool', {});
        await hook('TestTool', {});

        const result = await hook('TestTool', {});
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Rate limit exceeded');
      });
    });

    describe('truncateResultHook', () => {
      it('should truncate long string results', async () => {
        const longString = 'x'.repeat(60000);
        const result = await truncateResultHook('TestTool', {}, longString);

        expect(result.length).toBeLessThan(60000);
        expect(result).toContain('... [truncated]');
      });

      it('should not modify short results', async () => {
        const result = await truncateResultHook('TestTool', {}, 'short');
        expect(result).toBe('short');
      });
    });

    describe('addMetadataHook', () => {
      it('should add metadata to object results', async () => {
        const result = await addMetadataHook('TestTool', {}, { data: 'value' });

        expect(result).toHaveProperty('data', 'value');
        expect(result).toHaveProperty('_meta');
        expect((result as any)._meta.toolName).toBe('TestTool');
      });

      it('should not modify non-object results', async () => {
        const result = await addMetadataHook('TestTool', {}, 'string result');
        expect(result).toBe('string result');
      });
    });
  });
});

describe('Tool Restriction Middleware', () => {
  describe('isToolAllowed', () => {
    it('should allow all tools when no restrictions', () => {
      const result = isToolAllowed('AnyTool', {});
      expect(result.allowed).toBe(true);
    });

    it('should allow tools in allowedTools list', () => {
      const result = isToolAllowed('Read', { allowedTools: ['Read', 'Write'] });
      expect(result.allowed).toBe(true);
    });

    it('should block tools not in allowedTools list', () => {
      const result = isToolAllowed('Bash', { allowedTools: ['Read', 'Write'] });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in the allowed tools list');
    });

    it('should be case-insensitive', () => {
      const result = isToolAllowed('READ', { allowedTools: ['read'] });
      expect(result.allowed).toBe(true);
    });
  });

  describe('filterTools', () => {
    const mockTools = [
      { name: 'Read' },
      { name: 'Write' },
      { name: 'Bash' },
    ] as any[];

    it('should return all tools when no restrictions', () => {
      const result = filterTools(mockTools);
      expect(result).toHaveLength(3);
    });

    it('should filter to allowed tools only', () => {
      const result = filterTools(mockTools, ['Read', 'Write']);
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.name)).toEqual(['Read', 'Write']);
    });
  });

  describe('createToolRestrictionMiddleware', () => {
    it('should allow tool execution when allowed', async () => {
      const middleware = createToolRestrictionMiddleware({
        allowedTools: ['TestTool'],
      });

      const execute = vi.fn().mockResolvedValue('result');
      const result = await middleware('TestTool', {}, execute);

      expect(result).toBe('result');
      expect(execute).toHaveBeenCalled();
    });

    it('should block tool execution when not allowed', async () => {
      const middleware = createToolRestrictionMiddleware({
        allowedTools: ['OtherTool'],
      });

      const execute = vi.fn().mockResolvedValue('result');
      const result = await middleware('TestTool', {}, execute);

      expect(result).toContain('Error');
      expect(execute).not.toHaveBeenCalled();
    });

    it('should throw when throwOnBlocked is true', async () => {
      const middleware = createToolRestrictionMiddleware({
        allowedTools: ['OtherTool'],
        throwOnBlocked: true,
      });

      await expect(middleware('TestTool', {}, vi.fn())).rejects.toThrow();
    });
  });

  describe('parseAllowedTools', () => {
    it('should parse comma-separated string', () => {
      const result = parseAllowedTools('Read, Write, Glob');
      expect(result).toEqual(['Read', 'Write', 'Glob']);
    });

    it('should parse space-separated string', () => {
      const result = parseAllowedTools('Read Write Glob');
      expect(result).toEqual(['Read', 'Write', 'Glob']);
    });

    it('should handle array input', () => {
      const result = parseAllowedTools(['Read', 'Write']);
      expect(result).toEqual(['Read', 'Write']);
    });

    it('should return empty array for undefined', () => {
      const result = parseAllowedTools(undefined);
      expect(result).toEqual([]);
    });
  });
});

describe('Stop Validation Middleware', () => {
  describe('runStopValidationChecks', () => {
    it('should return empty array when no checks configured', async () => {
      const results = await runStopValidationChecks({});
      expect(results).toEqual([]);
    });

    // Note: These tests require actual command execution
    // In a real test environment, we would mock execAsync
  });

  describe('allValidationsPassed', () => {
    it('should return true when all pass', () => {
      const results = [
        { passed: true, checkName: 'Test1', message: 'OK' },
        { passed: true, checkName: 'Test2', message: 'OK' },
      ];
      expect(allValidationsPassed(results)).toBe(true);
    });

    it('should return false when any fail', () => {
      const results = [
        { passed: true, checkName: 'Test1', message: 'OK' },
        { passed: false, checkName: 'Test2', message: 'Failed' },
      ];
      expect(allValidationsPassed(results)).toBe(false);
    });

    it('should return true for empty results', () => {
      expect(allValidationsPassed([])).toBe(true);
    });
  });

  describe('formatValidationResults', () => {
    it('should show success message when all pass', () => {
      const results = [{ passed: true, checkName: 'Tests', message: 'All passed' }];
      const output = formatValidationResults(results);
      expect(output).toContain('All validation checks passed');
    });

    it('should show failure details', () => {
      const results = [
        { passed: false, checkName: 'Tests', message: 'Tests failed: 3 failures' },
      ];
      const output = formatValidationResults(results);
      expect(output).toContain('Cannot stop yet');
      expect(output).toContain('Tests');
      expect(output).toContain('Tests failed');
    });
  });
});
