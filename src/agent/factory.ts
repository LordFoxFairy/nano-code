import { createDeepAgent } from 'deepagents';
import { MemorySaver } from '@langchain/langgraph';
import { NanoConfig, RouterMode } from '../core/config/types';
import { ModelResolver } from '../core/llm/resolver';
import { LocalSandbox } from './sandbox';
import { getNanoCodeTools } from './tools';
import * as fs from 'fs';

export interface AgentOptions {
  config: NanoConfig;
  mode: string;
  cwd: string;
  memory?: string[];
  skills?: string[];
  hitl?: boolean;
}

export async function createNanoCodeAgent(options: AgentOptions): Promise<any> {
  const { config, mode, cwd } = options;

  if (!fs.existsSync(cwd)) {
    throw new Error(`Working directory does not exist: ${cwd}`);
  }

  try {
    // Resolve model using ModelResolver
    const model = ModelResolver.resolveByMode(config, mode as RouterMode);

    // Use LocalSandbox as backend
    const backend = new LocalSandbox(cwd);

    // Get custom tools (only ask_user now)
    const tools = getNanoCodeTools();

    // Configure HITL interruptions
    let interruptOn;
    if (options.hitl === false) {
      interruptOn = undefined;
    } else {
      interruptOn = config.settings?.interruptOn || {
        write_file: true,
        edit_file: true,
        execute: true
      };
    }

    // Create deepagents instance
    return await createDeepAgent({
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
