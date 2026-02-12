import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system' | 'unknown';

export interface ParsedMessage {
  role: MessageRole;
  content: string;
  toolCalls?: any[];
  id: string;
  name?: string;
  isError?: boolean;
}

/**
 * Detects the role of a message
 */
export function getMessageRole(msg: any): MessageRole {
  // 1. Check strict LangChain instances
  if (msg instanceof HumanMessage) return 'user';
  if (msg instanceof AIMessage) return 'assistant';
  if (msg instanceof ToolMessage) return 'tool';
  if (msg instanceof SystemMessage) return 'system';

  // 2. Check explicit role property (OpenAI format or simple object)
  if (msg.role) {
    if (msg.role === 'human' || msg.role === 'user') return 'user';
    if (msg.role === 'ai' || msg.role === 'assistant') return 'assistant';
    if (msg.role === 'tool') return 'tool';
    if (msg.role === 'system') return 'system';
    return msg.role as MessageRole;
  }

  // 3. Check constructor name (Deserialized LangChain objects)
  if (msg.constructor && msg.constructor.name && msg.constructor.name !== 'Object') {
    const name = msg.constructor.name;
    if (name === 'HumanMessage' || name === 'human') return 'user';
    if (name === 'AIMessage' || name === 'ai') return 'assistant';
    if (name === 'ToolMessage' || name === 'ToolMessageChunk' || name === 'tool') return 'tool';
    if (name === 'SystemMessage' || name === 'system') return 'system';
  }

  // 4. Check serialized ID array (Serialized LangChain objects)
  if (msg.id && Array.isArray(msg.id)) {
    const idString = msg.id.join('.');
    if (idString.includes('HumanMessage')) return 'user';
    if (idString.includes('AIMessage')) return 'assistant';
    if (idString.includes('ToolMessage')) return 'tool';
    if (idString.includes('SystemMessage')) return 'system';
  }

  // 5. Check type property (Some LangChain formats)
  if (msg.type) {
    if (msg.type === 'human') return 'user';
    if (msg.type === 'ai') return 'assistant';
    if (msg.type === 'tool') return 'tool';
    if (msg.type === 'system') return 'system';
  }

  return 'unknown';
}

/**
 * Extracts text content from a message
 */
export function getMessageContent(msg: any): string {
  let content = msg.content;

  // Handle kwargs fallback (serialized format)
  if (content === undefined && msg.kwargs) {
    content = msg.kwargs.content;
  }

  // Handle string content
  if (typeof content === 'string') {
    return content;
  }

  // Handle array content (multimodal or structured)
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.text || '')
      .join('');
  }

  return '';
}

/**
 * Extracts tool calls from a message
 */
export function getToolCalls(msg: any): any[] {
  // 1. Standard tool_calls property
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    return msg.tool_calls;
  }

  // 2. Serialized/kwargs format
  if (msg.kwargs && msg.kwargs.tool_calls && Array.isArray(msg.kwargs.tool_calls)) {
    return msg.kwargs.tool_calls;
  }

  // 3. Additional kwargs (older format)
  if (msg.additional_kwargs && msg.additional_kwargs.tool_calls) {
    return msg.additional_kwargs.tool_calls;
  }

  // 4. Content array with tool_use type (Anthropic sometimes uses this)
  const content = msg.content || (msg.kwargs && msg.kwargs.content);
  if (Array.isArray(content)) {
    const toolUses = content
      .filter((part: any) => part.type === 'tool_use')
      .map((part: any) => ({
        name: part.name,
        args: part.input || part.args,
        id: part.id,
      }));

    if (toolUses.length > 0) return toolUses;
  }

  return [];
}

/**
 * Generates a unique ID for a message
 */
export function getMessageId(
  msg: any,
  role: string,
  content: string,
  toolCalls: any[] = [],
): string {
  if (typeof msg.id === 'string') {
    return msg.id;
  }

  if (msg.kwargs && typeof msg.kwargs.id === 'string') {
    return msg.kwargs.id;
  }

  if (msg.id && Array.isArray(msg.id)) {
    // Include content hash or length to allow multiple messages of same type but different content
    const contentSuffix = content ? content.substring(0, 10).replace(/\s/g, '') : 'empty';
    const toolSuffix = toolCalls ? toolCalls.length : 0;
    return `${msg.id.join('_')}_${contentSuffix}_${toolSuffix}`;
  }

  // Fallback ID generation
  const contentSuffix = content ? content.substring(0, 30).replace(/\s/g, '') : 'empty';
  return `${role}-${contentSuffix}-${Date.now()}`;
}

/**
 * Parses any message object into a standardized format
 */
export function parseMessage(msg: any): ParsedMessage {
  const role = getMessageRole(msg);
  const content = getMessageContent(msg);
  const toolCalls = getToolCalls(msg);
  const id = getMessageId(msg, role, content, toolCalls);

  // Extract name (for tool messages)
  let name = msg.name;
  if (!name && msg.kwargs) {
    name = msg.kwargs.name;
  }

  // Extract error status (for tool messages)
  let isError = msg.is_error;
  if (isError === undefined && msg.kwargs) {
    isError = msg.kwargs.is_error;
  }

  return {
    role,
    content,
    toolCalls,
    id,
    name,
    isError,
  };
}
