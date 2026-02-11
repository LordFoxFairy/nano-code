import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export class AskUserTool extends StructuredTool {
  name = 'ask_user';
  description = 'Ask the user a question to get more information or clarification. Use this when you need input from the user to proceed.';

  schema = z.object({
    question: z.string().describe('The question to ask the user'),
    type: z.enum(['text', 'confirm', 'select']).optional().describe('The type of input required'),
    options: z.array(z.string()).optional().describe('Options for select type'),
  });

  async _call(input: { question: string; type?: 'text' | 'confirm' | 'select'; options?: string[] }): Promise<string> {
    // This tool is intended to be intercepted or handled by the agent loop/UI.
    // We return a structured response that can be parsed by the caller.
    return JSON.stringify({
        tool: 'ask_user',
        question: input.question,
        type: input.type || 'text',
        options: input.options
    });
  }
}

/**
 * Returns a list of custom tools for NanoCode.
 * Note: File traversal and manipulation tools are now provided by the LocalSandbox (BaseSandbox).
 */
export function getNanoCodeTools(): StructuredTool[] {
    return [new AskUserTool()];
}
