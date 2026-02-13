import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { checkCommandSecurity, type SecurityCheckResult } from './security.js';

export interface ExecuteResult {
  code: number;
  stdout: string;
  stderr: string;
  securityWarning?: string;
}

export class ShellSession {
  private currentCwd: string;
  private env: Record<string, string>;

  constructor(initialCwd: string, _options?: { strictSecurity?: boolean }) {
    this.currentCwd = path.resolve(initialCwd);
    this.env = Object.entries(process.env).reduce(
      (acc, [k, v]) => {
        if (typeof v === 'string') acc[k] = v;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  // Execute command and maintain CWD state
  async execute(command: string, timeout: number = 120000): Promise<ExecuteResult> {
    const securityResult = this.checkSecurity(command);

    if (!securityResult.allowed) {
      throw new Error(
        `Security: ${securityResult.reason} (category: ${securityResult.category}, pattern: ${securityResult.pattern})`,
      );
    }

    // For warnings, continue but include in result
    const securityWarning =
      securityResult.severity === 'warn' ? securityResult.reason : undefined;

    // Use a unique delimiter to capture PWD after execution
    const delimiter = `__NANO_CWD_${Date.now()}__`;

    // Construct command to print PWD and exit code after execution
    // Use { } to group commands in current shell, ensuring state changes (cd) persist
    // Syntax: { command; }; exit_code=$?; ...
    // Note: spaces and semicolon required for { }
    // But we need to handle potential syntax errors in command too.
    // If command ends with ";", we might get "; ;".
    // Safer to wrap: { eval "command"; } ... but quoting is hard.

    // Simple approach: try to use { } group
    // But ensure `command` doesn't break syntax.
    // If we assume `command` is a valid shell string:
    const wrappedCommand = `{ ${command}; }; __EXIT_CODE__=$?; echo "${delimiter}$PWD"; exit $__EXIT_CODE__`;

    try {
      const { stdout, stderr, exitCode } = await execa(wrappedCommand, {
        cwd: this.currentCwd,
        shell: true, // Use default shell
        timeout,
        reject: false,
        env: this.env,
      });

      let output = stdout;

      // Extract new CWD
      if (output.includes(delimiter)) {
        const parts = output.split(delimiter);
        const newCwd = parts.pop()?.trim();
        output = parts.join(delimiter); // Restore original output minus the CWD part

        // Update CWD if it exists
        if (newCwd && (await fs.pathExists(newCwd))) {
          this.currentCwd = newCwd;
        }
      }

      // Remove trailing newline if it looks like just a newline was left
      if (output.endsWith('\n')) {
        // We don't want to aggressively trim real output, but echo adds a newline.
        // The simple split usually leaves the previous part intact.
      }

      return {
        code: exitCode ?? 1, // Fallback exitCode if undefined (e.g. signal killed)
        stdout: output,
        stderr: stderr,
        securityWarning,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        code: 1,
        stdout: '',
        stderr: errorMessage,
      };
    }
  }

  // Get current working directory
  getCwd(): string {
    return this.currentCwd;
  }

  /**
   * Comprehensive security check using the security module
   * Returns detailed information about the security assessment
   */
  private checkSecurity(command: string): SecurityCheckResult {
    return checkCommandSecurity(command);
  }

  /**
   * Quick check if command is blocked (for backward compatibility)
   */
  isDangerous(command: string): boolean {
    const result = this.checkSecurity(command);
    return result.severity === 'block';
  }
}
