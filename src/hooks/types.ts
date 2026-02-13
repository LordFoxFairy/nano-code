/**
 * Hook System Types
 *
 * Defines the types for NanoCode's event-based hook system, matching Claude Code's architecture.
 * Supports 9 hook event types with prompt-based and command-based execution.
 */

/**
 * All supported hook event types
 */
export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'
  | 'Notification';

/**
 * Hook execution type
 */
export type HookType = 'command' | 'prompt';

/**
 * Permission decision for PreToolUse hooks
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Hook definition
 */
export interface HookDefinition {
  /** Unique hook ID */
  id?: string;
  /** Hook type: command (bash/python) or prompt (LLM-based) */
  type: HookType;
  /** For command hooks: the command to execute */
  command?: string;
  /** For prompt hooks: the prompt template */
  prompt?: string;
  /** Timeout in milliseconds (default: 60000 for command, 30000 for prompt) */
  timeout?: number;
  /** Only run this hook once per session */
  once?: boolean;
  /** Matcher regex for tool names (PreToolUse/PostToolUse only) */
  matcher?: string;
  /** Hook description for debugging */
  description?: string;
  /** Whether this hook is enabled */
  enabled?: boolean;
}

/**
 * Hook group for a specific event with matcher
 */
export interface HookGroup {
  /** The hooks to execute */
  hooks: HookDefinition[];
  /** Regex matcher for tool names (PreToolUse/PostToolUse) */
  matcher?: string;
  /** Description of this hook group */
  description?: string;
}

/**
 * Complete hooks configuration (from hooks.json)
 */
export interface HooksConfig {
  /** Configuration description */
  description?: string;
  /** Hook groups by event type */
  hooks: {
    [K in HookEventType]?: HookGroup[];
  };
}

/**
 * Context passed to hooks
 */
export interface HookContext {
  /** Current session ID */
  sessionId: string;
  /** Path to transcript file */
  transcriptPath?: string;
  /** Current working directory */
  cwd: string;
  /** Permission mode */
  permissionMode?: string;
  /** Project directory */
  projectDir?: string;
  /** Environment file path for SessionStart */
  envFilePath?: string;
  /** Plugin root (if hook is from a plugin) */
  pluginRoot?: string;
}

/**
 * Input for PreToolUse hook
 */
export interface PreToolUseInput {
  event: 'PreToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  context: HookContext;
}

/**
 * Input for PostToolUse hook
 */
export interface PostToolUseInput {
  event: 'PostToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: unknown;
  error?: string;
  context: HookContext;
}

/**
 * Input for UserPromptSubmit hook
 */
export interface UserPromptSubmitInput {
  event: 'UserPromptSubmit';
  userPrompt: string;
  context: HookContext;
}

/**
 * Input for Stop hook
 */
export interface StopInput {
  event: 'Stop';
  stopReason?: string;
  context: HookContext;
}

/**
 * Input for SubagentStop hook
 */
export interface SubagentStopInput {
  event: 'SubagentStop';
  agentName: string;
  stopReason?: string;
  context: HookContext;
}

/**
 * Input for SessionStart hook
 */
export interface SessionStartInput {
  event: 'SessionStart';
  context: HookContext;
}

/**
 * Input for SessionEnd hook
 */
export interface SessionEndInput {
  event: 'SessionEnd';
  sessionDuration: number;
  context: HookContext;
}

/**
 * Input for PreCompact hook
 */
export interface PreCompactInput {
  event: 'PreCompact';
  currentTokenCount: number;
  maxTokens: number;
  context: HookContext;
}

/**
 * Input for Notification hook
 */
export interface NotificationInput {
  event: 'Notification';
  notificationType: string;
  message: string;
  context: HookContext;
}

/**
 * Union of all hook inputs
 */
export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | UserPromptSubmitInput
  | StopInput
  | SubagentStopInput
  | SessionStartInput
  | SessionEndInput
  | PreCompactInput
  | NotificationInput;

/**
 * Output from a hook execution
 */
export interface HookOutput {
  /** Whether to continue with the operation */
  continue: boolean;
  /** Suppress output from being shown */
  suppressOutput?: boolean;
  /** System message to add to context */
  systemMessage?: string;
  /** Additional context to add to the model */
  additionalContext?: string;
  /** Hook-specific output data */
  hookSpecificOutput?: {
    /** Permission decision (PreToolUse only) */
    permissionDecision?: PermissionDecision;
    /** Updated input (PreToolUse only) */
    updatedInput?: Record<string, unknown>;
    /** Modified prompt (UserPromptSubmit only) */
    modifiedPrompt?: string;
    /** Environment variables to set (SessionStart only) */
    envVars?: Record<string, string>;
  };
  /** Error message if hook failed */
  error?: string;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  /** Hook ID */
  hookId: string;
  /** Whether hook succeeded */
  success: boolean;
  /** Exit code (for command hooks) */
  exitCode?: number;
  /** Hook output */
  output?: HookOutput;
  /** Execution duration in ms */
  duration: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Aggregated result from all hooks for an event
 */
export interface HookEventResult {
  /** Event type */
  event: HookEventType;
  /** Whether all hooks passed */
  allPassed: boolean;
  /** Whether to continue with the operation */
  continue: boolean;
  /** Aggregated system messages */
  systemMessages: string[];
  /** Aggregated additional context */
  additionalContext: string[];
  /** Hook-specific output (merged from all hooks) */
  hookSpecificOutput?: HookOutput['hookSpecificOutput'];
  /** Individual hook results */
  results: HookExecutionResult[];
  /** Total execution time */
  totalDuration: number;
}

/**
 * Hook manager options
 */
export interface HookManagerOptions {
  /** Path to hooks.json config */
  configPath?: string;
  /** Default timeout for command hooks */
  defaultCommandTimeout?: number;
  /** Default timeout for prompt hooks */
  defaultPromptTimeout?: number;
  /** Run hooks in parallel (default: true) */
  parallel?: boolean;
  /** Debug mode - log hook executions */
  debug?: boolean;
}
