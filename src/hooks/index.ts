/**
 * NanoCode Hook System
 *
 * A comprehensive event-based hook system matching Claude Code's architecture.
 * Supports 9 event types with both command-based and prompt-based execution.
 *
 * Event Types:
 * - PreToolUse: Validate/modify tool calls before execution
 * - PostToolUse: Process results after tool execution
 * - UserPromptSubmit: Intercept and modify user input
 * - Stop: Validate when agent wants to stop
 * - SubagentStop: Validate when subagent completes
 * - SessionStart: Initialize session (load context, set env vars)
 * - SessionEnd: Cleanup on session end
 * - PreCompact: Run before context compaction/summarization
 * - Notification: React to system notifications
 *
 * Hook Types:
 * - command: Execute bash/python scripts
 * - prompt: LLM-driven validation with natural language
 *
 * Usage:
 * ```typescript
 * import { getHookManager } from './hooks';
 *
 * const manager = getHookManager();
 *
 * // Add a command hook
 * manager.addHook('PreToolUse', {
 *   type: 'command',
 *   command: 'python3 ${NANOCODE_PLUGIN_ROOT}/hooks/validate.py',
 *   timeout: 10000,
 *   matcher: 'Write|Edit',
 * });
 *
 * // Add a prompt hook
 * manager.addHook('Stop', {
 *   type: 'prompt',
 *   prompt: 'Should this agent stop? Reason: $STOP_REASON',
 * });
 *
 * // Execute hooks
 * const result = await manager.preToolUse('Write', { path: '/etc/passwd' });
 * if (!result.continue) {
 *   console.log('Blocked:', result.systemMessages);
 * }
 * ```
 */

export * from './types.js';
export * from './manager.js';
export * from './executor.js';

// Re-export convenience functions
export { getHookManager, initializeHookManager, resetHookManager, HookManager } from './manager.js';
