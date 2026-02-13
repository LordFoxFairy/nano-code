import { PermissionRuleConfig, PermissionRequest, PermissionLevel } from './types.js';
import { minimatch } from 'minimatch';

export class PermissionRule {
  constructor(private config: PermissionRuleConfig) {}

  matches(request: PermissionRequest): boolean {
    // Check tool name match (supports glob)
    if (!minimatch(request.tool, this.config.tool)) {
      return false;
    }

    // If arguments pattern is not specified, it matches all arguments for the tool
    if (!this.config.arguments) {
      return true;
    }

    // Convert arguments object to string representation for matching
    // This is a simplification - depending on how complex arguments are,
    // we might need more sophisticated matching logic.
    // For now, we'll try to match against a stringified version or specific critical args
    const argString = this.serializeArgs(request.arguments);

    return minimatch(argString, this.config.arguments);
  }

  get level(): PermissionLevel {
    return this.config.level;
  }

  get raw(): PermissionRuleConfig {
    return { ...this.config };
  }

  private serializeArgs(args: unknown): string {
    if (typeof args === 'string') return args;
    if (typeof args !== 'object' || args === null) return String(args);

    const obj = args as Record<string, unknown>;

    // For common tool structures where 'command' or 'path' is the main thing to check
    if (typeof obj.command === 'string') return obj.command;
    if (typeof obj.path === 'string') return obj.path;
    if (typeof obj.file_path === 'string') return obj.file_path;
    if (typeof obj.url === 'string') return obj.url;

    // Fallback to JSON string
    return JSON.stringify(args);
  }
}
