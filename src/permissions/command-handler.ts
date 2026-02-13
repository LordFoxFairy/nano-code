import chalk from 'chalk';
import { PermissionManager } from './manager.js';
import { PermissionLevel, PermissionRuleConfig } from './types.js';

let permissionManagerInstance: PermissionManager | null = null;

function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager();
  }
  return permissionManagerInstance;
}

export interface PermissionCommandResult {
  success: boolean;
  output: string;
}

/**
 * Get color for permission level
 */
function getPermissionLevelColor(level: PermissionLevel): (text: string) => string {
  switch (level) {
    case 'allow':
      return chalk.green;
    case 'deny':
      return chalk.red;
    case 'ask':
      return chalk.yellow;
    default:
      return chalk.white;
  }
}

/**
 * Show permission rules status
 */
export function handlePermissionsStatus(): PermissionCommandResult {
  const permManager = getPermissionManager();
  const globalRules = permManager.listGlobalRules();
  const projectRules = permManager.listProjectRules();

  const output: string[] = [chalk.bold('Permission Rules'), ''];

  // Show project rules first (higher priority)
  if (projectRules.length > 0) {
    output.push(chalk.cyan('Project Rules') + chalk.dim(' (higher priority)'));
    projectRules.forEach((rule: PermissionRuleConfig, i: number) => {
      const levelColor = getPermissionLevelColor(rule.level);
      const pattern = rule.arguments ? ` "${rule.arguments}"` : '';
      output.push(`  ${i + 1}. ${levelColor(rule.level.toUpperCase())} ${chalk.bold(rule.tool)}${pattern}`);
    });
    output.push('');
  }

  // Show global rules
  if (globalRules.length > 0) {
    output.push(chalk.cyan('Global Rules'));
    globalRules.forEach((rule: PermissionRuleConfig, i: number) => {
      const levelColor = getPermissionLevelColor(rule.level);
      const pattern = rule.arguments ? ` "${rule.arguments}"` : '';
      output.push(`  ${i + 1}. ${levelColor(rule.level.toUpperCase())} ${chalk.bold(rule.tool)}${pattern}`);
    });
    output.push('');
  }

  if (globalRules.length === 0 && projectRules.length === 0) {
    output.push(chalk.dim('No permission rules configured.'));
    output.push('');
    output.push(chalk.dim('Default behavior: All tool calls require approval (ask).'));
    output.push('');
  }

  output.push(chalk.bold('Usage:'));
  output.push(`  ${chalk.cyan('/permissions add <level> <tool> [pattern]')} - Add a rule`);
  output.push(`    Levels: ${chalk.green('allow')}, ${chalk.red('deny')}, ${chalk.yellow('ask')}`);
  output.push(`    Examples:`);
  output.push(`      /permissions add allow Bash "npm *"     - Allow npm commands`);
  output.push(`      /permissions add deny Bash "rm -rf *"   - Deny rm -rf`);
  output.push(`      /permissions add allow Read             - Allow all file reads`);
  output.push(`  ${chalk.cyan('/permissions remove <index>')} - Remove a global rule`);
  output.push(`  ${chalk.cyan('/permissions reset')} - Reset all rules`);

  return { success: true, output: output.join('\n') };
}

/**
 * Add a permission rule
 */
export function handlePermissionsAdd(args: string[]): PermissionCommandResult {
  if (args.length < 2) {
    return {
      success: false,
      output: chalk.red('Usage: /permissions add <level> <tool> [pattern]') +
        '\n\nLevels: allow, deny, ask' +
        '\nExamples:' +
        '\n  /permissions add allow Bash "npm *"' +
        '\n  /permissions add deny Bash "rm -rf *"' +
        '\n  /permissions add allow Read',
    };
  }

  const level = args[0]?.toLowerCase() as PermissionLevel;
  const tool = args[1];
  const pattern = args.slice(2).join(' ') || undefined;

  if (!['allow', 'deny', 'ask'].includes(level)) {
    return {
      success: false,
      output: chalk.red(`Invalid level "${level}". Must be: allow, deny, or ask`),
    };
  }

  if (!tool) {
    return {
      success: false,
      output: chalk.red('Tool name is required.'),
    };
  }

  const rule: PermissionRuleConfig = {
    tool,
    level,
    arguments: pattern,
  };

  const permManager = getPermissionManager();
  permManager.addGlobalRule(rule);

  const levelColor = getPermissionLevelColor(level);
  const patternStr = pattern ? ` with pattern "${pattern}"` : '';

  return {
    success: true,
    output: chalk.green(`Added rule: ${levelColor(level.toUpperCase())} ${tool}${patternStr}`),
  };
}

/**
 * Remove a global permission rule by index
 */
export function handlePermissionsRemove(indexStr?: string): PermissionCommandResult {
  if (!indexStr) {
    return {
      success: false,
      output: chalk.red('Usage: /permissions remove <index>'),
    };
  }

  const index = parseInt(indexStr, 10) - 1; // Convert to 0-based
  const permManager = getPermissionManager();
  const globalRules = permManager.listGlobalRules();

  if (isNaN(index) || index < 0 || index >= globalRules.length) {
    return {
      success: false,
      output: chalk.red(`Invalid index. Must be between 1 and ${globalRules.length}.`),
    };
  }

  const rule = globalRules[index];
  permManager.removeGlobalRule(index);

  return {
    success: true,
    output: chalk.green(`Removed rule: ${rule?.tool}${rule?.arguments ? ` "${rule.arguments}"` : ''}`),
  };
}

/**
 * Reset all permission rules
 */
export function handlePermissionsReset(): PermissionCommandResult {
  const permManager = getPermissionManager();
  const globalRules = permManager.listGlobalRules();

  // Remove all global rules
  for (let i = globalRules.length - 1; i >= 0; i--) {
    permManager.removeGlobalRule(i);
  }

  return {
    success: true,
    output: chalk.green('All global permission rules have been reset.'),
  };
}

/**
 * Handle /permissions command with subcommands
 */
export function handlePermissions(args: string[]): PermissionCommandResult {
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'add':
      return handlePermissionsAdd(args.slice(1));
    case 'remove':
      return handlePermissionsRemove(args[1]);
    case 'reset':
      return handlePermissionsReset();
    default:
      return handlePermissionsStatus();
  }
}
