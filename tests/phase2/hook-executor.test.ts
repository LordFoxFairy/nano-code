/**
 * HookExecutor Tests (Phase 2)
 *
 * Tests for executing hook commands with proper stdin/stdout handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HookExecutor } from '../../src/core/hooks/index.js';
import type { HookConfig, HookExecutionInput } from '../../src/types';

describe('HookExecutor', () => {
  let executor: HookExecutor;

  beforeEach(() => {
    executor = new HookExecutor();
  });

  describe('substituteVariables()', () => {
    it('should substitute ${SKILL_ROOT} variable', () => {
      const command = 'python3 ${SKILL_ROOT}/hooks/script.py';
      const result = executor.substituteVariables(command, {
        SKILL_ROOT: '/path/to/skill',
        SESSION_ID: 'test-session',
      });
      expect(result).toBe('python3 /path/to/skill/hooks/script.py');
    });

    it('should substitute ${SESSION_ID} variable', () => {
      const command = 'echo ${SESSION_ID}';
      const result = executor.substituteVariables(command, {
        SKILL_ROOT: '/path',
        SESSION_ID: 'my-session-123',
      });
      expect(result).toBe('echo my-session-123');
    });

    it('should substitute multiple variables', () => {
      const command = '${SKILL_ROOT}/run.sh --session=${SESSION_ID}';
      const result = executor.substituteVariables(command, {
        SKILL_ROOT: '/skills/security',
        SESSION_ID: 'abc123',
      });
      expect(result).toBe('/skills/security/run.sh --session=abc123');
    });

    it('should handle missing variables gracefully', () => {
      const command = 'python3 ${UNKNOWN}/script.py';
      const result = executor.substituteVariables(command, {
        SKILL_ROOT: '/path',
        SESSION_ID: 'test',
      });
      // Unknown variables should remain unchanged
      expect(result).toBe('python3 ${UNKNOWN}/script.py');
    });

    it('should handle empty environment', () => {
      const command = 'echo hello';
      const result = executor.substituteVariables(command, {
        SKILL_ROOT: '',
        SESSION_ID: '',
      });
      expect(result).toBe('echo hello');
    });
  });

  describe('executeHook()', () => {
    const mockInput: HookExecutionInput = {
      session_id: 'test-session',
      tool_name: 'Edit',
      tool_input: {
        file_path: '/test/file.ts',
        new_string: 'console.log("test")',
      },
    };

    it('should execute a simple echo command and capture stdout', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'echo "hook executed"',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hook executed');
      expect(result.blocked).toBe(false);
    });

    it('should capture exit code 0 as non-blocking', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'exit 0',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.exitCode).toBe(0);
      expect(result.blocked).toBe(false);
    });

    it('should capture exit code 2 as blocking', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'exit 2',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.exitCode).toBe(2);
      expect(result.blocked).toBe(true);
    });

    it('should capture stderr output', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'echo "warning" >&2',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.stderr.trim()).toBe('warning');
    });

    it('should pass JSON input via stdin', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        // Read stdin and echo it back
        command: 'cat',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      const parsed = JSON.parse(result.stdout);
      expect(parsed.session_id).toBe('test-session');
      expect(parsed.tool_name).toBe('Edit');
      expect(parsed.tool_input.file_path).toBe('/test/file.ts');
    });

    it('should substitute SKILL_ROOT in command', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'echo "${SKILL_ROOT}"',
      };

      const result = await executor.executeHook(
        hookConfig,
        mockInput,
        '/my/skill/path',
      );

      expect(result.stdout.trim()).toBe('/my/skill/path');
    });

    it('should handle non-existent command gracefully', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: '/nonexistent/command/that/does/not/exist',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      // Should fail but not throw
      expect(result.exitCode).not.toBe(0);
      // Non-zero exit that isn't 2 should not block
      expect(result.blocked).toBe(false);
    });

    it('should handle timeout', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'sleep 10',
      };

      // Use a short timeout
      const result = await executor.executeHook(
        hookConfig,
        mockInput,
        '/tmp',
        { timeout: 100 },
      );

      // Should have timed out
      expect(result.exitCode).not.toBe(0);
      expect(result.blocked).toBe(false);
    }, 5000);

    it('should inject environment variables', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'echo "$SKILL_ROOT:$SESSION_ID"',
      };

      const result = await executor.executeHook(
        hookConfig,
        mockInput,
        '/skills/test',
      );

      expect(result.stdout.trim()).toBe('/skills/test:test-session');
    });
  });

  describe('error handling', () => {
    const mockInput: HookExecutionInput = {
      session_id: 'test',
      tool_name: 'Edit',
      tool_input: {},
    };

    it('should handle command syntax errors', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'invalid syntax {{{{',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.exitCode).not.toBe(0);
      expect(result.blocked).toBe(false);
    });

    it('should treat exit code 1 as non-blocking', async () => {
      const hookConfig: HookConfig = {
        type: 'command',
        command: 'exit 1',
      };

      const result = await executor.executeHook(hookConfig, mockInput, '/tmp');

      expect(result.exitCode).toBe(1);
      expect(result.blocked).toBe(false);
    });
  });
});
