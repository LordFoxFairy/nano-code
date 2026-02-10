/**
 * HookRegistry (Phase 2)
 *
 * Registers and retrieves hooks from loaded skills.
 * Manages hook lifecycle and provides lookup by event type.
 */

import type { HooksJson, HookEventType, RegisteredHook } from '../../types';
import { HookMatcher } from './matcher.js';

export class HookRegistry {
  private readonly hooks: Map<HookEventType, RegisteredHook[]> = new Map();
  private readonly matcher: HookMatcher = new HookMatcher();

  /**
   * Register hooks from a skill's hooks.json
   * @param skillName The skill name for namespace
   * @param skillRoot The skill root directory path
   * @param hooksJson The parsed hooks.json content
   */
  registerHooks(skillName: string, skillRoot: string, hooksJson: HooksJson): void {
    const eventTypes: HookEventType[] = [
      'PreToolUse',
      'PostToolUse',
      'Stop',
      'UserPromptSubmit',
      'SessionStart',
    ];

    for (const eventType of eventTypes) {
      const matchers = hooksJson.hooks[eventType];
      if (!matchers || matchers.length === 0) {
        continue;
      }

      for (const matcherConfig of matchers) {
        for (const hookConfig of matcherConfig.hooks) {
          this.addHook(eventType, {
            skillName,
            skillRoot,
            config: hookConfig,
            matcher: matcherConfig.matcher,
          });
        }
      }
    }
  }

  /**
   * Add a single hook to the registry
   */
  private addHook(eventType: HookEventType, hook: RegisteredHook): void {
    const existing = this.hooks.get(eventType) || [];
    existing.push(hook);
    this.hooks.set(eventType, existing);
  }

  /**
   * Get all hooks for a specific event type
   */
  getHooksForEvent(eventType: HookEventType): RegisteredHook[] {
    return this.hooks.get(eventType) || [];
  }

  /**
   * Get hooks that match a specific tool for an event type
   */
  getHooksForTool(eventType: HookEventType, toolName: string): RegisteredHook[] {
    const allHooks = this.getHooksForEvent(eventType);
    return allHooks.filter((hook) =>
      this.matcher.matchesTool(hook.matcher, toolName),
    );
  }

  /**
   * Check if any hooks are registered for an event type
   */
  hasHooksForEvent(eventType: HookEventType): boolean {
    const hooks = this.hooks.get(eventType);
    return hooks !== undefined && hooks.length > 0;
  }

  /**
   * Clear all registered hooks
   */
  clear(): void {
    this.hooks.clear();
  }
}
