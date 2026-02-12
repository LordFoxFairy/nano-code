import { StructuredTool } from '@langchain/core/tools';

/**
 * Configuration for tool restriction
 */
export interface ToolRestrictionConfig {
  /** List of allowed tool names. If empty or undefined, all tools are allowed. */
  allowedTools?: string[];
  /** Whether to throw an error when a blocked tool is called (default: false, returns error message) */
  throwOnBlocked?: boolean;
}

/**
 * Result of tool restriction check
 */
export interface ToolRestrictionResult {
  allowed: boolean;
  toolName: string;
  reason?: string;
}

/**
 * Check if a tool is allowed based on restriction config
 */
export function isToolAllowed(toolName: string, config: ToolRestrictionConfig): ToolRestrictionResult {
  // If no restrictions, all tools are allowed
  if (!config.allowedTools || config.allowedTools.length === 0) {
    return { allowed: true, toolName };
  }

  // Check if tool is in allowed list (case-insensitive)
  const normalizedAllowed = config.allowedTools.map((t) => t.toLowerCase());
  const isAllowed = normalizedAllowed.includes(toolName.toLowerCase());

  return {
    allowed: isAllowed,
    toolName,
    reason: isAllowed
      ? undefined
      : `Tool '${toolName}' is not in the allowed tools list: ${config.allowedTools.join(', ')}`,
  };
}

/**
 * Filter tools based on allowed list
 * Returns only the tools that are in the allowed list
 */
export function filterTools(tools: StructuredTool[], allowedToolNames?: string[]): StructuredTool[] {
  // If no restrictions, return all tools
  if (!allowedToolNames || allowedToolNames.length === 0) {
    return tools;
  }

  const normalizedAllowed = allowedToolNames.map((t) => t.toLowerCase());
  return tools.filter((tool) => normalizedAllowed.includes(tool.name.toLowerCase()));
}

/**
 * Create a wrapToolCall middleware function for tool restriction
 * This can be used with deepagents middleware configuration
 */
export function createToolRestrictionMiddleware(config: ToolRestrictionConfig) {
  return async <T>(
    toolName: string,
    _toolArgs: Record<string, unknown>,
    execute: () => Promise<T>,
  ): Promise<T | string> => {
    const result = isToolAllowed(toolName, config);

    if (!result.allowed) {
      if (config.throwOnBlocked) {
        throw new Error(result.reason);
      }
      return `Error: ${result.reason}` as T;
    }

    return execute();
  };
}

/**
 * Format allowed tools list for display
 */
export function formatAllowedTools(allowedTools?: string[]): string {
  if (!allowedTools || allowedTools.length === 0) {
    return 'All tools allowed';
  }
  return `Allowed tools: ${allowedTools.join(', ')}`;
}

/**
 * Parse allowed-tools string from frontmatter
 * Supports comma-separated, space-separated, or array format
 */
export function parseAllowedTools(value: string | string[] | undefined): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((t) => t.trim()).filter(Boolean);
  }

  // Parse comma or space separated string
  return value
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}
