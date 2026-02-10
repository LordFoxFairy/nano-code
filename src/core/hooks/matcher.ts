/**
 * HookMatcher (Phase 2)
 *
 * Matches tool names against hook matchers (regex patterns).
 * Supports pipe-separated patterns (e.g., "Edit|Write|MultiEdit")
 * and full regex patterns.
 */

import type { HookMatcher as HookMatcherType } from '../../types';

export class HookMatcher {
  /**
   * Check if a tool name matches a matcher pattern
   * @param matcherPattern Regex pattern (e.g., "Edit|Write|MultiEdit")
   * @param toolName The tool name to check
   * @returns true if the tool matches the pattern
   */
  matchesTool(matcherPattern: string, toolName: string): boolean {
    if (!matcherPattern || !toolName) {
      return false;
    }

    try {
      // Create a regex that matches the full tool name
      const regex = new RegExp(`^(?:${matcherPattern})$`);
      return regex.test(toolName);
    } catch {
      // Invalid regex pattern - return false
      return false;
    }
  }

  /**
   * Find all hooks that match a given tool name
   * @param toolName The tool being invoked
   * @param hooks Array of hook matchers to check
   * @returns Array of matching hook matchers in order
   */
  findMatchingHooks(
    toolName: string,
    hooks: HookMatcherType[],
  ): HookMatcherType[] {
    if (!hooks || hooks.length === 0) {
      return [];
    }

    return hooks.filter((hook) => this.matchesTool(hook.matcher, toolName));
  }
}
