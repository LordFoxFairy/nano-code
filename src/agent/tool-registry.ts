/**
 * Tool Registry for NanoCode
 *
 * Provides a centralized registry for tool management, enabling:
 * - Tool name to StructuredTool instance resolution
 * - SubAgent tools configuration from string[] to StructuredTool[]
 * - Tool discovery and validation
 */

import { StructuredTool } from '@langchain/core/tools';

/**
 * Tool registration entry
 */
export interface ToolRegistration {
  name: string;
  tool: StructuredTool;
  description?: string;
  category?: string;
}

/**
 * Tool resolution result
 */
export interface ToolResolutionResult {
  resolved: StructuredTool[];
  missing: string[];
}

/**
 * ToolRegistry - Centralized tool management
 *
 * Usage:
 * ```typescript
 * const registry = new ToolRegistry();
 * registry.register(new ReadTool());
 * registry.register(new WriteTool());
 *
 * // Resolve tool names to instances
 * const { resolved, missing } = registry.resolveTools(['read', 'write', 'unknown']);
 * // resolved: [ReadTool, WriteTool]
 * // missing: ['unknown']
 * ```
 */
export class ToolRegistry {
  private tools: Map<string, ToolRegistration> = new Map();

  constructor() {}

  /**
   * Register a tool in the registry
   */
  register(tool: StructuredTool, options?: { category?: string }): void {
    const registration: ToolRegistration = {
      name: tool.name.toLowerCase(),
      tool,
      description: tool.description,
      category: options?.category,
    };
    this.tools.set(registration.name, registration);
  }

  /**
   * Register multiple tools at once
   */
  registerAll(tools: StructuredTool[], options?: { category?: string }): void {
    for (const tool of tools) {
      this.register(tool, options);
    }
  }

  /**
   * Get a tool by name (case-insensitive)
   */
  get(name: string): StructuredTool | undefined {
    return this.tools.get(name.toLowerCase())?.tool;
  }

  /**
   * Check if a tool exists in the registry
   */
  has(name: string): boolean {
    return this.tools.has(name.toLowerCase());
  }

  /**
   * Remove a tool from the registry
   */
  remove(name: string): boolean {
    return this.tools.delete(name.toLowerCase());
  }

  /**
   * Get all registered tools
   */
  getAll(): StructuredTool[] {
    return Array.from(this.tools.values()).map((reg) => reg.tool);
  }

  /**
   * Get all tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): StructuredTool[] {
    return Array.from(this.tools.values())
      .filter((reg) => reg.category === category)
      .map((reg) => reg.tool);
  }

  /**
   * Resolve tool names to StructuredTool instances
   * Returns both resolved tools and missing tool names
   */
  resolveTools(toolNames: string[]): ToolResolutionResult {
    const resolved: StructuredTool[] = [];
    const missing: string[] = [];

    for (const name of toolNames) {
      const tool = this.get(name);
      if (tool) {
        resolved.push(tool);
      } else {
        missing.push(name);
      }
    }

    return { resolved, missing };
  }

  /**
   * Resolve tool names, throwing if any are missing
   */
  resolveToolsStrict(toolNames: string[]): StructuredTool[] {
    const { resolved, missing } = this.resolveTools(toolNames);
    if (missing.length > 0) {
      throw new Error(`Unknown tools: ${missing.join(', ')}`);
    }
    return resolved;
  }

  /**
   * Filter existing tools by allowed names
   */
  filterByAllowed(allowedNames: string[]): StructuredTool[] {
    const normalizedAllowed = allowedNames.map((n) => n.toLowerCase());
    return Array.from(this.tools.values())
      .filter((reg) => normalizedAllowed.includes(reg.name))
      .map((reg) => reg.tool);
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get registry size
   */
  get size(): number {
    return this.tools.size;
  }
}

/**
 * Global tool registry instance
 * Use this for application-wide tool registration
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getGlobalToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize the global registry with tools
 */
export function initializeGlobalToolRegistry(tools: StructuredTool[]): ToolRegistry {
  const registry = getGlobalToolRegistry();
  registry.registerAll(tools);
  return registry;
}

/**
 * Reset the global registry (mainly for testing)
 */
export function resetGlobalToolRegistry(): void {
  globalRegistry = null;
}
