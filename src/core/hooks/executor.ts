/**
 * HookExecutor (Phase 2)
 *
 * Executes hook commands with proper stdin/stdout/stderr handling.
 * Supports variable substitution and environment injection.
 *
 * Protocol:
 * - Input: JSON via stdin
 * - Output: stdout for data, stderr for warnings
 * - Exit codes: 0=allow, 2=block, other=allow (fail open)
 */

import { spawn } from 'child_process';
import type { HookConfig, HookExecutionInput, HookExecutionResult, HookEnvironment } from '../../types';

export interface HookExecutorOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000;

export class HookExecutor {
  /**
   * Substitute environment variables in command string
   */
  substituteVariables(command: string, env: HookEnvironment): string {
    let result = command;

    // Substitute known variables
    if (env.SKILL_ROOT) {
      result = result.replace(/\$\{SKILL_ROOT\}/g, env.SKILL_ROOT);
    }
    if (env.SESSION_ID) {
      result = result.replace(/\$\{SESSION_ID\}/g, env.SESSION_ID);
    }
    if (env.ENABLE_SECURITY_REMINDER !== undefined) {
      result = result.replace(
        /\$\{ENABLE_SECURITY_REMINDER\}/g,
        env.ENABLE_SECURITY_REMINDER,
      );
    }

    return result;
  }

  /**
   * Execute a hook command
   * @param hookConfig The hook configuration
   * @param input The hook input (passed via stdin as JSON)
   * @param skillRoot The skill root directory path
   * @param options Executor options
   * @returns The execution result
   */
  async executeHook(
    hookConfig: HookConfig,
    input: HookExecutionInput,
    skillRoot: string,
    options: HookExecutorOptions = {},
  ): Promise<HookExecutionResult> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    const env: HookEnvironment = {
      SKILL_ROOT: skillRoot,
      SESSION_ID: input.session_id,
    };

    // Substitute variables in command
    const command = this.substituteVariables(hookConfig.command, env);

    // Prepare stdin JSON
    const stdinJson = JSON.stringify(input);

    // Execute the command
    return this.spawnProcess(command, stdinJson, env, timeout);
  }

  /**
   * Spawn a process and capture output
   */
  private spawnProcess(
    command: string,
    stdin: string,
    hookEnv: HookEnvironment,
    timeout: number,
  ): Promise<HookExecutionResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let exitCode = 0;
      let timedOut = false;

      // Merge hook environment with process environment
      const processEnv = {
        ...process.env,
        SKILL_ROOT: hookEnv.SKILL_ROOT,
        SESSION_ID: hookEnv.SESSION_ID,
      };

      if (hookEnv.ENABLE_SECURITY_REMINDER !== undefined) {
        (processEnv as Record<string, string>).ENABLE_SECURITY_REMINDER =
          hookEnv.ENABLE_SECURITY_REMINDER;
      }

      const child = spawn('sh', ['-c', command], {
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeout);

      // Write stdin
      if (child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      // Capture stdout
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      // Capture stderr
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timeoutId);
        stderr += error.message;
        exitCode = 1;
        resolve({
          exitCode,
          stdout,
          stderr,
          blocked: false, // Fail open
        });
      });

      // Handle close
      child.on('close', (code) => {
        clearTimeout(timeoutId);
        exitCode = timedOut ? 124 : (code ?? 1);
        resolve({
          exitCode,
          stdout,
          stderr,
          blocked: exitCode === 2,
        });
      });
    });
  }
}
