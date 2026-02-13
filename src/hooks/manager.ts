/**
 * Hook Manager
 *
 * Central manager for the NanoCode hook system.
 * Handles hook registration, matching, and execution for all event types.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  HookEventType,
  HookDefinition,
  HookGroup,
  HooksConfig,
  HookInput,
  HookOutput,
  HookContext,
  HookExecutionResult,
  HookEventResult,
  HookManagerOptions,
} from './types.js';
import { executeCommandHook, executePromptHook, loadHooksConfig, findHooksConfigs } from './executor.js';

/**
 * Hook Manager - manages all hooks for a NanoCode session
 */
export class HookManager {
  private hooks: Map<HookEventType, HookGroup[]> = new Map();
  private executedOnceHooks: Set<string> = new Set();
  private options: HookManagerOptions;
  private context: HookContext;
  private llmCallback?: (prompt: string) => Promise<string>;

  constructor(options: HookManagerOptions = {}) {
    this.options = {
      defaultCommandTimeout: 60000,
      defaultPromptTimeout: 30000,
      parallel: true,
      debug: false,
      ...options,
    };

    // Initialize default context
    this.context = {
      sessionId: uuidv4(),
      cwd: process.cwd(),
    };

    // Initialize empty hook groups for all event types
    const eventTypes: HookEventType[] = [
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
      'SubagentStop',
      'SessionStart',
      'SessionEnd',
      'PreCompact',
      'Notification',
    ];
    for (const event of eventTypes) {
      this.hooks.set(event, []);
    }
  }

  /**
   * Set the LLM callback for prompt-based hooks
   */
  setLLMCallback(callback: (prompt: string) => Promise<string>): void {
    this.llmCallback = callback;
  }

  /**
   * Update hook context
   */
  updateContext(context: Partial<HookContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Get current context
   */
  getContext(): HookContext {
    return { ...this.context };
  }

  /**
   * Load hooks from a configuration object
   */
  loadFromConfig(config: HooksConfig, pluginRoot?: string): void {
    for (const [eventStr, groups] of Object.entries(config.hooks || {})) {
      const event = eventStr as HookEventType;
      if (!groups) continue;

      for (const group of groups) {
        // Add plugin root to context for each hook
        const enrichedHooks = group.hooks.map((hook) => ({
          ...hook,
          id: hook.id || uuidv4(),
          enabled: hook.enabled !== false,
        }));

        const enrichedGroup: HookGroup & { pluginRoot?: string } = {
          ...group,
          hooks: enrichedHooks,
        };

        if (pluginRoot) {
          (enrichedGroup as { pluginRoot?: string }).pluginRoot = pluginRoot;
        }

        this.addHookGroup(event, enrichedGroup);
      }
    }
  }

  /**
   * Load hooks from all hooks.json files in a directory
   */
  async loadFromDirectory(rootDir: string): Promise<void> {
    const configPaths = await findHooksConfigs(rootDir);

    for (const configPath of configPaths) {
      const config = await loadHooksConfig(configPath);
      if (config) {
        // Extract plugin root from config path
        const pluginRoot = configPath.includes('.agents/skills/')
          ? configPath.split('.agents/skills/')[1]?.split('/')[0]
          : undefined;

        this.loadFromConfig(config as unknown as HooksConfig, pluginRoot);
      }
    }
  }

  /**
   * Add a hook group for an event type
   */
  addHookGroup(event: HookEventType, group: HookGroup): void {
    const groups = this.hooks.get(event) || [];
    groups.push(group);
    this.hooks.set(event, groups);
  }

  /**
   * Add a single hook for an event type
   */
  addHook(event: HookEventType, hook: HookDefinition, matcher?: string): void {
    this.addHookGroup(event, {
      hooks: [{ ...hook, id: hook.id || uuidv4() }],
      matcher,
    });
  }

  /**
   * Remove a hook by ID
   */
  removeHook(hookId: string): boolean {
    for (const [event, groups] of this.hooks.entries()) {
      for (const group of groups) {
        const index = group.hooks.findIndex((h) => h.id === hookId);
        if (index !== -1) {
          group.hooks.splice(index, 1);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all hooks for an event type
   */
  getHooks(event: HookEventType): HookGroup[] {
    return this.hooks.get(event) || [];
  }

  /**
   * Get matching hooks for a tool name
   */
  private getMatchingHooks(event: HookEventType, toolName?: string): HookDefinition[] {
    const groups = this.hooks.get(event) || [];
    const matchingHooks: HookDefinition[] = [];

    for (const group of groups) {
      // Check if matcher matches tool name
      if (group.matcher && toolName) {
        try {
          const regex = new RegExp(group.matcher);
          if (!regex.test(toolName)) {
            continue;
          }
        } catch {
          // Invalid regex, skip this group
          continue;
        }
      }

      // Add all enabled hooks from this group
      for (const hook of group.hooks) {
        if (hook.enabled !== false) {
          matchingHooks.push(hook);
        }
      }
    }

    return matchingHooks;
  }

  /**
   * Execute all hooks for an event
   */
  async executeHooks(input: HookInput): Promise<HookEventResult> {
    const event = input.event;
    const startTime = Date.now();
    const results: HookExecutionResult[] = [];
    const systemMessages: string[] = [];
    const additionalContext: string[] = [];
    let hookSpecificOutput: HookOutput['hookSpecificOutput'] = {};
    let allContinue = true;

    // Get tool name for matching (if applicable)
    const toolName = 'toolName' in input ? input.toolName : undefined;

    // Get matching hooks
    const matchingHooks = this.getMatchingHooks(event, toolName);

    if (matchingHooks.length === 0) {
      return {
        event,
        allPassed: true,
        continue: true,
        systemMessages: [],
        additionalContext: [],
        results: [],
        totalDuration: 0,
      };
    }

    // Filter out once-executed hooks
    const hooksToExecute = matchingHooks.filter((hook) => {
      if (hook.once && hook.id && this.executedOnceHooks.has(hook.id)) {
        return false;
      }
      return true;
    });

    // Execute hooks (parallel or sequential)
    if (this.options.parallel) {
      const promises = hooksToExecute.map((hook) =>
        this.executeHook(hook, input).then((result) => {
          if (hook.once && hook.id) {
            this.executedOnceHooks.add(hook.id);
          }
          return result;
        }),
      );
      const hookResults = await Promise.all(promises);
      results.push(...hookResults);
    } else {
      for (const hook of hooksToExecute) {
        const result = await this.executeHook(hook, input);
        if (hook.once && hook.id) {
          this.executedOnceHooks.add(hook.id);
        }
        results.push(result);

        // Stop early if hook blocked
        if (!result.output?.continue) {
          break;
        }
      }
    }

    // Aggregate results
    for (const result of results) {
      if (!result.success) {
        if (this.options.debug) {
          console.warn(`Hook ${result.hookId} failed:`, result.error);
        }
      }

      if (result.output) {
        if (!result.output.continue) {
          allContinue = false;
        }
        if (result.output.systemMessage) {
          systemMessages.push(result.output.systemMessage);
        }
        if (result.output.additionalContext) {
          additionalContext.push(result.output.additionalContext);
        }
        if (result.output.hookSpecificOutput) {
          hookSpecificOutput = { ...hookSpecificOutput, ...result.output.hookSpecificOutput };
        }
      }
    }

    return {
      event,
      allPassed: results.every((r) => r.success),
      continue: allContinue,
      systemMessages,
      additionalContext,
      hookSpecificOutput: Object.keys(hookSpecificOutput).length > 0 ? hookSpecificOutput : undefined,
      results,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: HookDefinition, input: HookInput): Promise<HookExecutionResult> {
    const context = this.context;

    if (this.options.debug) {
      console.log(`Executing hook ${hook.id} (${hook.type}) for ${input.event}`);
    }

    if (hook.type === 'command') {
      return executeCommandHook(hook, input, context);
    } else if (hook.type === 'prompt') {
      return executePromptHook(hook, input, context, this.llmCallback);
    } else {
      return {
        hookId: hook.id || 'unknown',
        success: false,
        duration: 0,
        error: `Unknown hook type: ${hook.type}`,
      };
    }
  }

  // ============================================
  // CONVENIENCE METHODS FOR SPECIFIC EVENTS
  // ============================================

  /**
   * Execute PreToolUse hooks
   */
  async preToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'PreToolUse',
      toolName,
      toolInput,
      context: this.context,
    });
  }

  /**
   * Execute PostToolUse hooks
   */
  async postToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResult: unknown,
    error?: string,
  ): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'PostToolUse',
      toolName,
      toolInput,
      toolResult,
      error,
      context: this.context,
    });
  }

  /**
   * Execute UserPromptSubmit hooks
   */
  async userPromptSubmit(userPrompt: string): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'UserPromptSubmit',
      userPrompt,
      context: this.context,
    });
  }

  /**
   * Execute Stop hooks
   */
  async stop(stopReason?: string): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'Stop',
      stopReason,
      context: this.context,
    });
  }

  /**
   * Execute SubagentStop hooks
   */
  async subagentStop(agentName: string, stopReason?: string): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'SubagentStop',
      agentName,
      stopReason,
      context: this.context,
    });
  }

  /**
   * Execute SessionStart hooks
   */
  async sessionStart(): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'SessionStart',
      context: this.context,
    });
  }

  /**
   * Execute SessionEnd hooks
   */
  async sessionEnd(sessionDuration: number): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'SessionEnd',
      sessionDuration,
      context: this.context,
    });
  }

  /**
   * Execute PreCompact hooks
   */
  async preCompact(currentTokenCount: number, maxTokens: number): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'PreCompact',
      currentTokenCount,
      maxTokens,
      context: this.context,
    });
  }

  /**
   * Execute Notification hooks
   */
  async notification(notificationType: string, message: string): Promise<HookEventResult> {
    return this.executeHooks({
      event: 'Notification',
      notificationType,
      message,
      context: this.context,
    });
  }

  /**
   * Get statistics about registered hooks
   */
  getStats(): { total: number; byEvent: Record<string, number> } {
    let total = 0;
    const byEvent: Record<string, number> = {};

    for (const [event, groups] of this.hooks.entries()) {
      let count = 0;
      for (const group of groups) {
        count += group.hooks.length;
      }
      byEvent[event] = count;
      total += count;
    }

    return { total, byEvent };
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    for (const event of this.hooks.keys()) {
      this.hooks.set(event, []);
    }
    this.executedOnceHooks.clear();
  }
}

// Global hook manager instance
let globalHookManager: HookManager | null = null;

/**
 * Get or create the global hook manager
 */
export function getHookManager(): HookManager {
  if (!globalHookManager) {
    globalHookManager = new HookManager();
  }
  return globalHookManager;
}

/**
 * Initialize hook manager with options
 */
export function initializeHookManager(options?: HookManagerOptions): HookManager {
  globalHookManager = new HookManager(options);
  return globalHookManager;
}

/**
 * Reset the global hook manager
 */
export function resetHookManager(): void {
  globalHookManager = null;
}
