/**
 * Tool Hooks Middleware
 *
 * This middleware demonstrates that wrapToolCall can fully replace a separate Hooks system.
 * It provides:
 * - PreToolUse: Validation before tool execution
 * - PostToolUse: Result processing after tool execution
 * - Logging/Auditing: Record all tool calls
 * - Error Recovery: Handle errors gracefully
 * - Result Transformation: Modify results before returning
 *
 * This is implemented via deepagents' wrapToolCall middleware pattern.
 */

/**
 * Tool call log entry
 */
export interface ToolCallLogEntry {
  timestamp: number;
  toolName: string;
  args: Record<string, unknown>;
  duration: number;
  success: boolean;
  error?: string;
  result?: unknown;
}

/**
 * Pre-tool-use hook function type
 */
export type PreToolUseHook = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<{ allowed: boolean; reason?: string; modifiedArgs?: Record<string, unknown> }>;

/**
 * Post-tool-use hook function type
 */
export type PostToolUseHook = <T>(
  toolName: string,
  args: Record<string, unknown>,
  result: T,
  error?: Error,
) => Promise<T>;

/**
 * Configuration for tool hooks middleware
 */
export interface ToolHooksConfig {
  /** Pre-tool-use validation hooks */
  preToolUse?: PreToolUseHook[];
  /** Post-tool-use processing hooks */
  postToolUse?: PostToolUseHook[];
  /** Enable logging of all tool calls */
  enableLogging?: boolean;
  /** Maximum log entries to keep (default: 1000) */
  maxLogEntries?: number;
  /** Custom error handler */
  onError?: (toolName: string, error: Error) => Promise<string | null>;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    retryDelay: number;
    retryableErrors?: string[];
  };
}

/**
 * Tool hooks middleware state
 */
class ToolHooksState {
  private logs: ToolCallLogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  addLog(entry: ToolCallLogEntry): void {
    this.logs.push(entry);
    // Trim old entries if exceeded
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }
  }

  getLogs(): ToolCallLogEntry[] {
    return [...this.logs];
  }

  getRecentLogs(count: number): ToolCallLogEntry[] {
    return this.logs.slice(-count);
  }

  clearLogs(): void {
    this.logs = [];
  }

  getStats(): { total: number; success: number; failed: number; avgDuration: number } {
    const total = this.logs.length;
    const success = this.logs.filter((l) => l.success).length;
    const failed = total - success;
    const avgDuration = total > 0 ? this.logs.reduce((acc, l) => acc + l.duration, 0) / total : 0;
    return { total, success, failed, avgDuration };
  }
}

// Global state instance
let globalState: ToolHooksState | null = null;

/**
 * Get the global tool hooks state
 */
export function getToolHooksState(): ToolHooksState {
  if (!globalState) {
    globalState = new ToolHooksState();
  }
  return globalState;
}

/**
 * Create a comprehensive wrapToolCall middleware with hooks support
 *
 * This demonstrates that middleware can fully replace a separate Hooks system:
 * - PreToolUse validation ✅
 * - PostToolUse processing ✅
 * - Logging/auditing ✅
 * - Error recovery ✅
 * - Result transformation ✅
 * - Retry logic ✅
 */
export function createToolHooksMiddleware(config: ToolHooksConfig) {
  const state = getToolHooksState();

  return async <T>(
    toolName: string,
    toolArgs: Record<string, unknown>,
    execute: () => Promise<T>,
  ): Promise<T | string> => {
    const startTime = Date.now();
    let currentArgs = toolArgs;
    let result: T | undefined;
    let error: Error | undefined;
    let retryCount = 0;

    // ============================================
    // 1. PRE-TOOL-USE HOOKS (Before execution)
    // ============================================
    if (config.preToolUse && config.preToolUse.length > 0) {
      for (const hook of config.preToolUse) {
        const hookResult = await hook(toolName, currentArgs);

        // Block execution if not allowed
        if (!hookResult.allowed) {
          const logEntry: ToolCallLogEntry = {
            timestamp: startTime,
            toolName,
            args: currentArgs,
            duration: Date.now() - startTime,
            success: false,
            error: hookResult.reason || 'Blocked by pre-tool-use hook',
          };
          if (config.enableLogging) {
            state.addLog(logEntry);
          }
          return `Error: ${hookResult.reason || 'Tool execution blocked by pre-hook'}` as unknown as T;
        }

        // Allow hooks to modify arguments
        if (hookResult.modifiedArgs) {
          currentArgs = hookResult.modifiedArgs;
        }
      }
    }

    // ============================================
    // 2. EXECUTE WITH RETRY LOGIC
    // ============================================
    const maxRetries = config.retry?.maxRetries || 0;
    const retryDelay = config.retry?.retryDelay || 1000;

    while (retryCount <= maxRetries) {
      try {
        result = await execute();
        break; // Success, exit retry loop
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));

        // Check if error is retryable
        const isRetryable =
          config.retry?.retryableErrors?.some((pattern) => error!.message.includes(pattern)) ??
          false;

        if (isRetryable && retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // ============================================
        // 3. ERROR RECOVERY
        // ============================================
        if (config.onError) {
          const recoveryResult = await config.onError(toolName, error);
          if (recoveryResult !== null) {
            // Custom error handler provided a fallback result
            const logEntry: ToolCallLogEntry = {
              timestamp: startTime,
              toolName,
              args: currentArgs,
              duration: Date.now() - startTime,
              success: false,
              error: error.message,
              result: recoveryResult,
            };
            if (config.enableLogging) {
              state.addLog(logEntry);
            }
            return recoveryResult as unknown as T;
          }
        }

        // No recovery, log and return error
        const logEntry: ToolCallLogEntry = {
          timestamp: startTime,
          toolName,
          args: currentArgs,
          duration: Date.now() - startTime,
          success: false,
          error: error.message,
        };
        if (config.enableLogging) {
          state.addLog(logEntry);
        }
        return `Error: ${error.message}` as unknown as T;
      }
    }

    // ============================================
    // 4. POST-TOOL-USE HOOKS (After execution)
    // ============================================
    if (config.postToolUse && config.postToolUse.length > 0 && result !== undefined) {
      for (const hook of config.postToolUse) {
        result = await hook(toolName, currentArgs, result, error);
      }
    }

    // ============================================
    // 5. LOGGING
    // ============================================
    if (config.enableLogging) {
      const logEntry: ToolCallLogEntry = {
        timestamp: startTime,
        toolName,
        args: currentArgs,
        duration: Date.now() - startTime,
        success: true,
        result: result,
      };
      state.addLog(logEntry);
    }

    return result!;
  };
}

// ============================================
// EXAMPLE HOOKS
// ============================================

/**
 * Pre-hook: Security validation
 */
export const securityValidationHook: PreToolUseHook = async (toolName, args) => {
  // Import security check dynamically to avoid circular dependency
  if (toolName === 'Bash' || toolName === 'execute') {
    const command = (args.command || args.cmd || '') as string;
    // Simple check - in production would use full security module
    if (command.includes('rm -rf /') || command.includes(':(){ :|:& };:')) {
      return {
        allowed: false,
        reason: `Dangerous command blocked: ${command.substring(0, 50)}...`,
      };
    }
  }
  return { allowed: true };
};

/**
 * Pre-hook: Rate limiting
 */
export function createRateLimitHook(maxCallsPerMinute: number): PreToolUseHook {
  const callTimestamps: number[] = [];

  return async () => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old timestamps
    while (callTimestamps.length > 0 && callTimestamps[0]! < oneMinuteAgo) {
      callTimestamps.shift();
    }

    if (callTimestamps.length >= maxCallsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${maxCallsPerMinute} calls per minute`,
      };
    }

    callTimestamps.push(now);
    return { allowed: true };
  };
}

/**
 * Post-hook: Truncate large results
 */
export const truncateResultHook: PostToolUseHook = async <T>(
  _toolName: string,
  _args: Record<string, unknown>,
  result: T,
): Promise<T> => {
  if (typeof result === 'string' && result.length > 50000) {
    return (result.substring(0, 50000) + '\n... [truncated]') as unknown as T;
  }
  return result;
};

/**
 * Post-hook: Add metadata to results
 */
export const addMetadataHook: PostToolUseHook = async <T>(
  toolName: string,
  _args: Record<string, unknown>,
  result: T,
): Promise<T> => {
  if (typeof result === 'object' && result !== null) {
    return {
      ...result,
      _meta: {
        toolName,
        timestamp: Date.now(),
      },
    } as unknown as T;
  }
  return result;
};

/**
 * Create a combined middleware with common hooks
 */
export function createDefaultToolHooksMiddleware() {
  return createToolHooksMiddleware({
    enableLogging: true,
    maxLogEntries: 1000,
    preToolUse: [securityValidationHook],
    postToolUse: [truncateResultHook],
    onError: async (toolName, error) => {
      // Log error but don't recover
      console.error(`Tool ${toolName} failed:`, error.message);
      return null;
    },
  });
}
