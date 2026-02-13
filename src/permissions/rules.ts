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

  private serializeArgs(args: any): string {
    if (typeof args === 'string') return args;
    if (typeof args !== 'object' || args === null) return String(args);

    // For common tool structures where 'command' or 'path' is the main thing to check
    if (args.command) return args.command;
    if (args.path) return args.path;
    if (args.file_path) return args.file_path;
    if (args.url) return args.url;

    // Fallback to JSON string
    return JSON.stringify(args);
  }
}
