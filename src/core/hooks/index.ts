/**
 * Hooks Module (Phase 2)
 *
 * Hook system for intercepting tool execution.
 * Supports PreToolUse, PostToolUse, Stop, UserPromptSubmit, SessionStart events.
 */

export { HookMatcher } from './matcher.js';
export { HookExecutor } from './executor.js';
export type { HookExecutorOptions } from './executor.js';
export { HookRegistry } from './registry.js';
