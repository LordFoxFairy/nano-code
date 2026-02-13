import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Configuration for stop validation checks
 */
export interface StopValidationConfig {
  /** Run tests before allowing stop */
  runTests?: boolean;
  /** Command to run tests (default: "npm test") */
  testCommand?: string;
  /** Run build before allowing stop */
  runBuild?: boolean;
  /** Command to run build (default: "npm run build") */
  buildCommand?: string;
  /** Check for uncommitted git changes */
  checkGitStatus?: boolean;
  /** Custom validation command to run */
  customValidation?: string;
  /** Timeout for each validation check (ms) */
  timeout?: number;
  /** Working directory for commands */
  cwd?: string;
}

/**
 * Result of a validation check
 */
export interface ValidationResult {
  passed: boolean;
  checkName: string;
  message: string;
  output?: string;
}

/**
 * Run a shell command with timeout
 */
async function runCommand(
  command: string,
  cwd: string,
  timeout: number = 60000,
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout,
      encoding: 'utf-8',
      cwd,
    });
    return {
      success: true,
      output: stdout || stderr,
    };
  } catch (err: unknown) {
    const error = err as { stdout?: string; message?: string };
    return {
      success: false,
      output: error.stdout || '',
      error: error.message || String(err),
    };
  }
}

/**
 * Perform validation checks before allowing agent to stop
 */
export async function runStopValidationChecks(config: StopValidationConfig): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const timeout = config.timeout || 60000;
  const cwd = config.cwd || process.cwd();

  // Run tests
  if (config.runTests) {
    const testCommand = config.testCommand || 'npm test';
    const result = await runCommand(testCommand, cwd, timeout);
    results.push({
      passed: result.success,
      checkName: 'Tests',
      message: result.success ? 'All tests passed' : `Tests failed: ${result.error}`,
      output: result.output,
    });
  }

  // Run build
  if (config.runBuild) {
    const buildCommand = config.buildCommand || 'npm run build';
    const result = await runCommand(buildCommand, cwd, timeout);
    results.push({
      passed: result.success,
      checkName: 'Build',
      message: result.success ? 'Build successful' : `Build failed: ${result.error}`,
      output: result.output,
    });
  }

  // Check git status
  if (config.checkGitStatus) {
    const result = await runCommand('git status --porcelain', cwd, 5000);
    const hasChanges = result.success && result.output.trim().length > 0;
    results.push({
      passed: !hasChanges,
      checkName: 'Git Status',
      message: hasChanges ? 'Uncommitted changes detected' : 'No uncommitted changes',
      output: result.output,
    });
  }

  // Custom validation
  if (config.customValidation) {
    const result = await runCommand(config.customValidation, cwd, timeout);
    results.push({
      passed: result.success,
      checkName: 'Custom Validation',
      message: result.success ? 'Custom validation passed' : `Custom validation failed: ${result.error}`,
      output: result.output,
    });
  }

  return results;
}

/**
 * Check if all validations passed
 */
export function allValidationsPassed(results: ValidationResult[]): boolean {
  return results.every((r) => r.passed);
}

/**
 * Format validation results for display
 */
export function formatValidationResults(results: ValidationResult[]): string {
  const failedChecks = results.filter((r) => !r.passed);

  if (failedChecks.length === 0) {
    return '✅ All validation checks passed.';
  }

  const lines = ['⚠️ Cannot stop yet. The following validation checks failed:\n'];

  for (const check of failedChecks) {
    lines.push(`\n**${check.checkName}**: ${check.message}`);
    if (check.output) {
      lines.push(`\`\`\`\n${check.output.slice(0, 500)}\n\`\`\``);
    }
  }

  lines.push('\n\nPlease fix these issues before completing the task.');

  return lines.join('');
}

/**
 * Default stop validation configuration
 */
export const DEFAULT_STOP_VALIDATION_CONFIG: StopValidationConfig = {
  runTests: false,
  runBuild: false,
  checkGitStatus: false,
  timeout: 60000,
};
