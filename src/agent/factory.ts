/**
 * Agent Factory
 * Creates and configures NanoCode agents
 *
 * Architecture:
 * - Skills: Knowledge injection via SKILL.md files (deepagents auto-loads)
 * - Subagents: Loaded from agents/*.md files in skills directories
 * - Memory: Project context via AGENTS.md files
 *
 * This enables Claude Code style skill/agent definitions to work seamlessly.
 */

import { existsSync } from 'fs';
import { StructuredTool } from '@langchain/core/tools';
import { createDeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import type { NanoConfig, RouterMode } from '../core/config/types.js';
import { ModelResolver } from '../core/llm/resolver.js';
import { LocalSandbox } from './sandbox.js';
import { getNanoCodeTools } from './tools.js';
import { loadSubagents } from '../core/agent/loader.js';
import { ToolRegistry, initializeGlobalToolRegistry } from './tool-registry.js';
import {
  createToolRestrictionMiddleware,
  filterTools,
  type ToolRestrictionConfig,
} from '../middleware/tool-restriction.js';
import {
  createNanoCodeMiddleware,
  type NanoCodeMiddlewareConfig,
  type UsageStats,
  MODEL_PRICING,
} from '../middleware/agent-middleware.js';

/**
 * Loaded subagent from our loader
 */
interface LoadedSubAgent {
  name: string;
  description: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
}

/**
 * Default tools requiring HITL approval
 *
 * Security Note: This config provides security enforcement by requiring
 * human approval before file writes and command execution. This replaces
 * the PreToolUse hook pattern from Claude Code with deepagents' native
 * interruptOn mechanism.
 */
const DEFAULT_INTERRUPT_CONFIG = {
  write_file: true,
  edit_file: true,
  execute: true,
};

/**
 * Options for creating an agent
 */
export interface AgentFactoryOptions {
  config: NanoConfig;
  mode: RouterMode;
  cwd: string;
  memory?: string[];
  skills?: string[];
  hitl?: boolean;
  /** Restrict tools to only these names */
  allowedTools?: string[];
  /** Throw error instead of returning message when blocked */
  throwOnBlockedTool?: boolean;
  /** Enable token tracking */
  enableTokenTracking?: boolean;
  /** Enable cost tracking */
  enableCostTracking?: boolean;
  /** Callback for usage updates */
  onUsageUpdate?: (stats: UsageStats) => void;
  /** Summarization config for context compaction */
  summarization?: {
    maxTokens: number;
    keepLastN?: number;
  };
}

/**
 * SubAgent configuration for deepagents
 */
interface DeepAgentSubAgent {
  name: string;
  description: string;
  systemPrompt?: string;
  model?: string;
  tools?: StructuredTool[];
}

/**
 * Agent input type
 */
export interface AgentInput {
  messages: Array<{ role: string; content: string }>;
}

/**
 * Agent config type
 */
export interface AgentConfig {
  configurable?: Record<string, unknown>;
  streamMode?: 'values' | 'messages' | 'updates';
  signal?: AbortSignal;
}

/**
 * Deep agent interface (from deepagents)
 */
interface DeepAgent {
  stream(input: AgentInput | unknown, config: AgentConfig): AsyncIterable<unknown>;
  invoke(input: AgentInput | unknown, config: AgentConfig): Promise<unknown>;
}

/**
 * Wrapper class for the agent with extended capabilities
 */
export class NanoCodeAgent {
  private readonly agent: DeepAgent;
  private readonly toolRegistry: ToolRegistry;

  constructor(
    agent: DeepAgent,
    private readonly context: {
      mode: RouterMode;
      toolRegistry: ToolRegistry;
    },
  ) {
    this.agent = agent;
    this.toolRegistry = context.toolRegistry;
  }

  /**
   * Stream agent responses
   */
  stream(input: AgentInput | unknown, config: AgentConfig): AsyncIterable<unknown> {
    return this.agent.stream(input, config);
  }

  /**
   * Invoke agent (non-streaming)
   */
  invoke(input: AgentInput | unknown, config: AgentConfig): Promise<unknown> {
    return this.agent.invoke(input, config);
  }

  /**
   * Get current mode
   */
  getMode(): RouterMode {
    return this.context.mode;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}

/**
 * AgentFactory - Creates NanoCode agents with skill support
 *
 * Skills are automatically loaded from .agents/skills/ by deepagents.
 * Each skill directory must contain a SKILL.md file with:
 * - YAML frontmatter (name, description)
 * - Markdown body with skill content
 *
 * Usage:
 * ```typescript
 * const agent = await new AgentFactory(options)
 *   .build();
 * ```
 */
export class AgentFactory {
  constructor(private readonly options: AgentFactoryOptions) {
    if (!existsSync(options.cwd)) {
      throw new Error(`Working directory does not exist: ${options.cwd}`);
    }
  }

  /**
   * Build the agent
   */
  async build(): Promise<NanoCodeAgent> {
    const {
      config,
      mode,
      cwd,
      hitl,
      allowedTools,
      throwOnBlockedTool,
      enableTokenTracking,
      enableCostTracking,
      onUsageUpdate,
      summarization,
    } = this.options;

    const model = ModelResolver.resolveByMode(config, mode);
    const backend = new LocalSandbox(cwd);
    let tools = getNanoCodeTools();

    // Initialize tool registry with all available tools
    const toolRegistry = initializeGlobalToolRegistry(tools);

    // Apply tool restrictions if specified
    if (allowedTools && allowedTools.length > 0) {
      tools = filterTools(tools, allowedTools);
    }

    const interruptOn =
      hitl === false ? undefined : config.settings?.interruptOn || DEFAULT_INTERRUPT_CONFIG;

    // Build NanoCode middleware for token tracking, cost calculation, summarization
    const nanoCodeMiddlewareConfig: NanoCodeMiddlewareConfig = {
      enableTokenTracking: enableTokenTracking ?? true, // Enable by default
      enableCostTracking: enableCostTracking ?? true,   // Enable by default
      pricing: this.getModelPricing(mode),
      onUsageUpdate,
      summarization,
    };
    const nanoCodeMiddleware = createNanoCodeMiddleware(nanoCodeMiddlewareConfig);

    // Build tool restriction middleware if needed
    const middlewareConfig: {
      wrapToolCall?: ReturnType<typeof createToolRestrictionMiddleware>;
      wrapModelCall?: typeof nanoCodeMiddleware.wrapModelCall;
      beforeModel?: typeof nanoCodeMiddleware.beforeModel;
    } = {};

    // Add NanoCode middleware hooks
    if (nanoCodeMiddleware.wrapModelCall) {
      middlewareConfig.wrapModelCall = nanoCodeMiddleware.wrapModelCall;
    }
    if (nanoCodeMiddleware.beforeModel) {
      middlewareConfig.beforeModel = nanoCodeMiddleware.beforeModel;
    }

    // Add tool restriction middleware
    if (allowedTools && allowedTools.length > 0) {
      const restrictionConfig: ToolRestrictionConfig = {
        allowedTools,
        throwOnBlocked: throwOnBlockedTool,
      };
      middlewareConfig.wrapToolCall = createToolRestrictionMiddleware(restrictionConfig);
    } else if (nanoCodeMiddleware.wrapToolCall) {
      // Use NanoCode middleware for tool tracking if no restrictions
      middlewareConfig.wrapToolCall = nanoCodeMiddleware.wrapToolCall as ReturnType<
        typeof createToolRestrictionMiddleware
      >;
    }

    // Load subagents from skills directories
    const skillsDirs = this.options.skills || ['.agents/skills/'];
    let subagents: DeepAgentSubAgent[] = [];

    try {
      const validSkillsDirs = skillsDirs.filter((d) => existsSync(d));
      if (validSkillsDirs.length > 0) {
        const loadedSubagents = await Promise.all(validSkillsDirs.map((dir) => loadSubagents(dir)));
        subagents = this.transformSubagents(loadedSubagents.flat(), toolRegistry);
      }
    } catch (error) {
      // Log warning but continue without subagents
      if (process.env.NODE_ENV !== 'test') {
        console.warn('Failed to load subagents:', error);
      }
    }

    const agentConfig = {
      model,
      backend,
      tools,
      skills: this.options.skills || ['.agents/skills/'],
      memory: this.options.memory || ['.agents/AGENTS.md'],
      subagents,
      interruptOn,
      checkpointer: new MemorySaver(),
      ...middlewareConfig,
    };

    const agent = createDeepAgent(agentConfig as Parameters<typeof createDeepAgent>[0]);

    return new NanoCodeAgent(agent as unknown as DeepAgent, {
      mode,
      toolRegistry,
    });
  }

  /**
   * Get model pricing based on mode
   */
  private getModelPricing(mode: RouterMode) {
    switch (mode) {
      case 'opus':
        return MODEL_PRICING['claude-opus-4'];
      case 'haiku':
        return MODEL_PRICING['claude-3-haiku'];
      case 'sonnet':
      default:
        return MODEL_PRICING['claude-sonnet-4'];
    }
  }

  /**
   * Transform loaded subagents to deepagents format with resolved tools
   */
  private transformSubagents(
    loadedSubagents: LoadedSubAgent[],
    toolRegistry: ToolRegistry,
  ): DeepAgentSubAgent[] {
    return loadedSubagents.map((agent) => {
      const subagent: DeepAgentSubAgent = {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
      };

      // Resolve tool names to StructuredTool instances using the registry
      if (agent.tools && agent.tools.length > 0) {
        const { resolved, missing } = toolRegistry.resolveTools(agent.tools);
        if (resolved.length > 0) {
          subagent.tools = resolved;
        }
        if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
          console.warn(`Subagent '${agent.name}' has unknown tools: ${missing.join(', ')}`);
        }
      }

      return subagent;
    });
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use AgentFactory instead
 */
export async function createNanoCodeAgent(options: {
  config: NanoConfig;
  mode: string;
  cwd: string;
  memory?: string[];
  skills?: string[];
  hitl?: boolean;
}): Promise<NanoCodeAgent> {
  const factory = new AgentFactory({
    ...options,
    mode: options.mode as RouterMode,
  });

  return factory.build();
}
