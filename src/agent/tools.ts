import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { WebFetchTool } from './tools/webfetch.js';
import { WebSearchTool } from './tools/websearch.js';
import { MultiEditTool } from './tools/multiedit.js';
import { LSPTool } from './tools/lsp.js';

export { WebFetchTool, createWebFetchTool } from './tools/webfetch.js';
export { WebSearchTool, createWebSearchTool } from './tools/websearch.js';
export { MultiEditTool, createMultiEditTool } from './tools/multiedit.js';
export { LSPTool } from './tools/lsp.js';
export type { EditOperation, FileEdit, EditResult } from './tools/multiedit.js';

export class AskUserTool extends StructuredTool {
  name = 'ask_user';
  description =
    'Ask the user a question to get more information or clarification. Use this when you need input from the user to proceed.';

  schema = z.object({
    question: z.string().describe('The question to ask the user'),
    type: z.enum(['text', 'confirm', 'select']).optional().describe('The type of input required'),
    options: z.array(z.string()).optional().describe('Options for select type'),
  });

  async _call(input: {
    question: string;
    type?: 'text' | 'confirm' | 'select';
    options?: string[];
  }): Promise<string> {
    // This tool is intended to be intercepted or handled by the agent loop/UI.
    // We return a structured response that can be parsed by the caller.
    return JSON.stringify({
      tool: 'ask_user',
      question: input.question,
      type: input.type || 'text',
      options: input.options,
    });
  }
}

/**
 * Options for configuring NanoCode tools
 */
export interface NanoCodeToolsOptions {
  /** Enable WebFetch tool for fetching web content */
  enableWebFetch?: boolean;
  /** WebFetch configuration options */
  webFetchOptions?: {
    maxContentLength?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  /** Enable WebSearch tool */
  enableWebSearch?: boolean;
  /** WebSearch configuration options */
  webSearchOptions?: {
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  /** Enable MultiEdit tool for batch file editing */
  enableMultiEdit?: boolean;
  /** MultiEdit configuration options */
  multiEditOptions?: {
    cwd?: string;
  };
  /** Enable LSP tool for code intelligence */
  enableLSP?: boolean;
}

/**
 * Returns a list of custom tools for NanoCode.
 * Note: File traversal and manipulation tools are now provided by the LocalSandbox (BaseSandbox).
 */
export function getNanoCodeTools(options?: NanoCodeToolsOptions): StructuredTool[] {
  const tools: StructuredTool[] = [new AskUserTool()];

  // Add WebFetch tool if enabled
  if (options?.enableWebFetch !== false) {
    // Enabled by default
    tools.push(new WebFetchTool(options?.webFetchOptions));
  }

  if (options?.enableWebSearch !== false) {
    // Enabled by default
    tools.push(new WebSearchTool(options?.webSearchOptions));
  }

  // Add MultiEdit tool if enabled
  if (options?.enableMultiEdit !== false) {
    // Enabled by default
    tools.push(new MultiEditTool(options?.multiEditOptions));
  }

  // Add LSP tool if enabled
  if (options?.enableLSP !== false) {
    // Enabled by default
    tools.push(new LSPTool());
  }

  return tools;
}
