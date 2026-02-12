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
import { createDeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import type { NanoConfig, RouterMode } from '../core/config/types.js';
import { ModelResolver } from '../core/llm/resolver.js';
import { LocalSandbox } from './sandbox.js';
import { getNanoCodeTools } from './tools.js';
import { loadSubagents } from '../core/agent/loader.js';

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
}

/**
 * Wrapper class for the agent with extended capabilities
 */
export class NanoCodeAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly agent: any;

  constructor(
    agent: any,
    private readonly context: {
      mode: RouterMode;
    },
  ) {
    this.agent = agent;
  }

  /**
   * Stream agent responses
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream(input: any, config: any): any {
    return this.agent.stream(input, config);
  }

  /**
   * Invoke agent (non-streaming)
   */
  invoke(input: any, config: any) {
    return this.agent.invoke(input, config);
  }

  /**
   * Get current mode
   */
  getMode(): RouterMode {
    return this.context.mode;
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
    const { config, mode, cwd, hitl } = this.options;

    const model = ModelResolver.resolveByMode(config, mode);
    const backend = new LocalSandbox(cwd);
    const tools = getNanoCodeTools();

    const interruptOn =
      hitl === false ? undefined : config.settings?.interruptOn || DEFAULT_INTERRUPT_CONFIG;

    // Load subagents from skills directories
    const skillsDirs = this.options.skills || ['.agents/skills/'];
    let subagents: any[] = [];

    try {
      // Find the first valid skills directory to load agents from
      // In the future we might want to load from all providing directories
      const validSkillsDirs = skillsDirs.filter((d) => existsSync(d));
      if (validSkillsDirs.length > 0) {
        // Load subagents from all skill directories
        const loadedSubagents = await Promise.all(validSkillsDirs.map((dir) => loadSubagents(dir)));
        // Transform NanoCode SubAgent format to deepagents SubAgent format
        // deepagents expects tools?: StructuredTool[] but our loader outputs tools: string[]
        // Since we can't resolve string names to tool instances at this layer,
        // we omit the tools field and let subagents use defaultTools from deepagents
        subagents = loadedSubagents.flat().map((agent) => ({
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          // Don't pass tools - deepagents expects StructuredTool[] not string[]
          // Subagents will inherit defaultTools from deepagents
        }));
      }
    } catch (error) {
      console.warn('Failed to load subagents:', error);
      // Continue without subagents rather than crashing
    }

    const agent = createDeepAgent({
      model,
      backend,
      tools: tools as any[],
      skills: this.options.skills || ['.agents/skills/'],
      memory: this.options.memory || ['.agents/AGENTS.md'],
      subagents,
      interruptOn: interruptOn as any,
      checkpointer: new MemorySaver(),
    });

    return new NanoCodeAgent(agent, {
      mode,
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
