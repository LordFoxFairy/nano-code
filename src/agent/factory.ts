import { existsSync } from 'fs';
import { createDeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import { NanoConfig, RouterMode } from '../core/config/types.js';
import { ModelResolver } from '../core/llm/resolver.js';
import { LocalSandbox } from './sandbox.js';
import { getNanoCodeTools } from './tools.js';

export interface AgentOptions {
  config: NanoConfig;
  mode: string;
  cwd: string;
  memory?: string[];
  skills?: string[];
  hitl?: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function createNanoCodeAgent(options: AgentOptions): Promise<any> {
  const { config, mode, cwd } = options;

  if (!existsSync(cwd)) {
    throw new Error(`Working directory does not exist: ${cwd}`);
  }

  try {
    const model = ModelResolver.resolveByMode(config, mode as RouterMode);
    const backend = new LocalSandbox(cwd);
    const tools = getNanoCodeTools();

    const interruptOn =
      options.hitl === false
        ? undefined
        : config.settings?.interruptOn || {
            write_file: true,
            edit_file: true,
            execute: true,
          };

    return createDeepAgent({
      model,
      backend,
      tools: tools as any[],
      skills: options.skills || ['.agents/skills/'],
      memory: options.memory || ['.agents/AGENTS.md'],
      interruptOn: interruptOn as any,
      checkpointer: new MemorySaver(),
    });
  } catch (error: any) {
    throw new Error(`Failed to create NanoCode agent: ${error.message}`);
  }
}
