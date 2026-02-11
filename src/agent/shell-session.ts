import { execa } from 'execa';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ExecuteResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class ShellSession {
  private currentCwd: string;
  private env: Record<string, string>;

  constructor(initialCwd: string) {
    this.currentCwd = path.resolve(initialCwd);
    this.env = Object.entries(process.env).reduce((acc, [k, v]) => {
      if (typeof v === 'string') acc[k] = v;
      return acc;
    }, {} as Record<string, string>);
  }

  // Execute command and maintain CWD state
  async execute(command: string, timeout: number = 120000): Promise<ExecuteResult> {
    if (this.isDangerous(command)) {
        throw new Error(`Dangerous command execution blocked: ${command}`);
    }

    // Use a unique delimiter to capture PWD after execution
    const delimiter = `__NANO_CWD_${Date.now()}__`;

    // Construct command to print PWD after execution, regardless of success/failure
    // We use ; to ensure PWD is printed even if command fails
    const wrappedCommand = `${command}; echo "${delimiter}$PWD"`;

    try {
        const { stdout, stderr, exitCode } = await execa(wrappedCommand, {
            cwd: this.currentCwd,
            shell: true, // Use default shell
            timeout,
            reject: false,
            env: this.env
        });

        let output = stdout;

        // Extract new CWD
        if (output.includes(delimiter)) {
            const parts = output.split(delimiter);
            const newCwd = parts.pop()?.trim();
            output = parts.join(delimiter); // Restore original output minus the CWD part

            // Update CWD if it exists
            if (newCwd && await fs.pathExists(newCwd)) {
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
            stderr: stderr
        };
    } catch (error: any) {
        return {
            code: 1,
            stdout: '',
            stderr: error.message
        };
    }
  }

  // Get current working directory
  getCwd(): string {
    return this.currentCwd;
  }

  // Basic security check
  private isDangerous(command: string): boolean {
    const dangerousPatterns = [
      'rm -rf /',
      'rm -fr /',
      ':(){:|:&};:', // fork bomb
      '> /dev/sda',
      'mkfs'
    ];

    return dangerousPatterns.some(p => command.includes(p));
  }
}
