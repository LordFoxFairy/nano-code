/**
 * Hook Executor
 *
 * Executes hooks based on their type (command or prompt).
 * Handles timeout, environment variables, and structured I/O.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import type {
  HookDefinition,
  HookInput,
  HookOutput,
  HookExecutionResult,
  HookContext,
} from './types.js';

/**
 * Default hook output (continue with no modifications)
 */
const DEFAULT_OUTPUT: HookOutput = {
  continue: true,
};

/**
 * Execute a command-based hook
 */
export async function executeCommandHook(
  hook: HookDefinition,
  input: HookInput,
  context: HookContext,
): Promise<HookExecutionResult> {
  const hookId = hook.id || uuidv4();
  const startTime = Date.now();
  const timeout = hook.timeout || 60000; // Default 60s for command hooks

  if (!hook.command) {
    return {
      hookId,
      success: false,
      duration: Date.now() - startTime,
      error: 'No command specified for command hook',
    };
  }

  try {
    // Build environment variables
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NANOCODE_SESSION_ID: context.sessionId,
      NANOCODE_CWD: context.cwd,
      NANOCODE_PROJECT_DIR: context.projectDir || context.cwd,
    };

    if (context.pluginRoot) {
      env.NANOCODE_PLUGIN_ROOT = context.pluginRoot;
    }
    if (context.transcriptPath) {
      env.NANOCODE_TRANSCRIPT_PATH = context.transcriptPath;
    }
    if (context.envFilePath) {
      env.NANOCODE_ENV_FILE = context.envFilePath;
    }

    // Replace environment variable placeholders in command
    let command = hook.command;
    command = command.replace(/\$\{NANOCODE_PLUGIN_ROOT\}/g, context.pluginRoot || '');
    command = command.replace(/\$\{NANOCODE_PROJECT_DIR\}/g, context.projectDir || context.cwd);
    command = command.replace(/\$\{NANOCODE_CWD\}/g, context.cwd);

    // Execute command with JSON input on stdin
    const result = await executeWithTimeout(command, JSON.stringify(input), env, timeout, context.cwd);

    // Parse output
    let output: HookOutput = DEFAULT_OUTPUT;
    if (result.stdout.trim()) {
      try {
        output = JSON.parse(result.stdout.trim());
      } catch {
        // If not JSON, treat stdout as system message
        output = {
          continue: result.exitCode === 0,
          systemMessage: result.stdout.trim(),
        };
      }
    }

    // Handle exit codes
    // 0: success
    // 2: blocking error (stderr fed to model)
    // other: non-blocking error
    if (result.exitCode === 2) {
      output = {
        continue: false,
        systemMessage: result.stderr || 'Hook blocked execution',
      };
    } else if (result.exitCode !== 0 && result.exitCode !== null) {
      // Non-zero non-2 exit code: non-blocking, log stderr
      if (result.stderr) {
        console.warn(`Hook ${hookId} stderr: ${result.stderr}`);
      }
    }

    return {
      hookId,
      success: result.exitCode === 0,
      exitCode: result.exitCode ?? undefined,
      output,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      hookId,
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a prompt-based hook (LLM-driven)
 */
export async function executePromptHook(
  hook: HookDefinition,
  input: HookInput,
  _context: HookContext,
  llmCallback?: (prompt: string) => Promise<string>,
): Promise<HookExecutionResult> {
  const hookId = hook.id || uuidv4();
  const startTime = Date.now();

  if (!hook.prompt) {
    return {
      hookId,
      success: false,
      duration: Date.now() - startTime,
      error: 'No prompt specified for prompt hook',
    };
  }

  if (!llmCallback) {
    return {
      hookId,
      success: false,
      duration: Date.now() - startTime,
      error: 'No LLM callback provided for prompt hook',
    };
  }

  try {
    // Build prompt with variable substitution
    let prompt = hook.prompt;
    prompt = prompt.replace(/\$TOOL_NAME/g, 'toolName' in input ? String(input.toolName) : '');
    prompt = prompt.replace(/\$TOOL_INPUT/g, 'toolInput' in input ? JSON.stringify(input.toolInput) : '');
    prompt = prompt.replace(/\$TOOL_RESULT/g, 'toolResult' in input ? JSON.stringify(input.toolResult) : '');
    prompt = prompt.replace(/\$USER_PROMPT/g, 'userPrompt' in input ? String(input.userPrompt) : '');
    prompt = prompt.replace(/\$EVENT/g, input.event);

    // Call LLM
    const response = await llmCallback(prompt);

    // Parse LLM response as JSON or interpret as decision
    let output: HookOutput;
    try {
      output = JSON.parse(response);
    } catch {
      // Interpret text response
      const lowerResponse = response.toLowerCase().trim();
      if (lowerResponse.includes('allow') || lowerResponse.includes('yes') || lowerResponse.includes('continue')) {
        output = { continue: true };
      } else if (lowerResponse.includes('deny') || lowerResponse.includes('no') || lowerResponse.includes('block')) {
        output = { continue: false, systemMessage: response };
      } else {
        output = { continue: true, systemMessage: response };
      }
    }

    return {
      hookId,
      success: true,
      output,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      hookId,
      success: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a command with timeout
 */
async function executeWithTimeout(
  command: string,
  stdin: string,
  env: Record<string, string>,
  timeout: number,
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    // Determine shell based on command
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set timeout
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        // Ignore kill errors
      }
    }, timeout);

    // Collect stdout
    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    // Collect stderr
    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    proc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Hook timed out after ${timeout}ms`));
      } else {
        resolve({ stdout, stderr, exitCode: code });
      }
    });

    // Write input to stdin
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
  });
}

/**
 * Load hooks configuration from a hooks.json file
 */
export async function loadHooksConfig(configPath: string): Promise<Record<string, unknown> | null> {
  try {
    if (await fs.pathExists(configPath)) {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  } catch (error) {
    console.warn(`Failed to load hooks config from ${configPath}:`, error);
    return null;
  }
}

/**
 * Find all hooks.json files in a directory tree
 */
export async function findHooksConfigs(rootDir: string): Promise<string[]> {
  const configs: string[] = [];

  // Check root hooks.json
  const rootConfig = path.join(rootDir, 'hooks', 'hooks.json');
  if (await fs.pathExists(rootConfig)) {
    configs.push(rootConfig);
  }

  // Check .nanocode/hooks.json
  const nanocodeConfig = path.join(rootDir, '.nanocode', 'hooks.json');
  if (await fs.pathExists(nanocodeConfig)) {
    configs.push(nanocodeConfig);
  }

  // Check plugins directory
  const pluginsDir = path.join(rootDir, '.agents', 'skills');
  if (await fs.pathExists(pluginsDir)) {
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginHooks = path.join(pluginsDir, entry.name, 'hooks', 'hooks.json');
        if (await fs.pathExists(pluginHooks)) {
          configs.push(pluginHooks);
        }
      }
    }
  }

  return configs;
}
