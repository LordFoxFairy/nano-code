import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandHandler } from '../../src/cli/commands.js';
import type { Session } from '../../src/cli/session.js';

// Test the CommandHandler directly since it's the core logic
// REPL integration is complex due to readline and process.stdin mocks

describe('CLI Integration', () => {
  let mockSession: any;
  let commandHandler: CommandHandler;

  beforeEach(() => {
    mockSession = {
      threadId: 'test-thread',
      mode: 'sonnet',
      addMessage: vi.fn(),
      setMode: vi.fn(),
      clear: vi.fn(),
    };

    commandHandler = new CommandHandler(mockSession as Session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle /help command', async () => {
    const result = await commandHandler.handle('/help');
    expect(result.success).toBe(true);
    expect(result.output).toContain('Available Commands');
    expect(result.output).toContain('/help');
    expect(result.output).toContain('/model');
    expect(result.output).toContain('/clear');
    expect(result.output).toContain('/exit');
  });

  it('should handle /model command', async () => {
    const result = await commandHandler.handle('/model opus');
    expect(result.success).toBe(true);
    expect(mockSession.setMode).toHaveBeenCalledWith('opus');
    expect(result.output).toContain('Switched to');
    expect(result.output).toContain('opus');
  });

  it('should handle invalid /model command', async () => {
    const result = await commandHandler.handle('/model invalid');
    expect(result.success).toBe(false);
    expect(mockSession.setMode).not.toHaveBeenCalled();
    expect(result.output).toContain('Invalid model');
  });

  it('should handle /clear command', async () => {
    const result = await commandHandler.handle('/clear');
    expect(result.success).toBe(true);
    expect(mockSession.clear).toHaveBeenCalled();
    expect(result.output).toContain('Context cleared');
  });

  it('should handle unknown command', async () => {
    const result = await commandHandler.handle('/unknown');
    expect(result.success).toBe(false);
    expect(result.output).toContain('Unknown command');
  });

  it('should parse command with arguments', () => {
    const parsed = commandHandler.parse('/model opus haiku');
    expect(parsed.command).toBe('/model');
    expect(parsed.args).toEqual(['opus', 'haiku']);
  });
});

describe('Message Parsing Integration', () => {
  it('should handle plain message format', async () => {
    const { parseMessage } = await import('../../src/cli/message-utils.js');

    const msg = { role: 'assistant', content: 'Hello!', id: 'msg-1' };
    const parsed = parseMessage(msg);

    expect(parsed.role).toBe('assistant');
    expect(parsed.content).toBe('Hello!');
  });

  it('should handle serialized LangChain format', async () => {
    const { parseMessage } = await import('../../src/cli/message-utils.js');

    const msg = {
      id: ['langchain_core', 'messages', 'AIMessage'],
      kwargs: { content: 'It is time to code.' },
    };
    const parsed = parseMessage(msg);

    expect(parsed.role).toBe('assistant');
    expect(parsed.content).toBe('It is time to code.');
  });

  it('should handle tool calls', async () => {
    const { parseMessage } = await import('../../src/cli/message-utils.js');

    const msg = {
      role: 'assistant',
      content: null,
      tool_calls: [{ name: 'test_tool', args: { foo: 'bar' }, id: 'tc-1' }],
      id: 'msg-tc',
    };
    const parsed = parseMessage(msg);

    expect(parsed.role).toBe('assistant');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls![0].name).toBe('test_tool');
  });

  it('should handle tool messages', async () => {
    const { parseMessage } = await import('../../src/cli/message-utils.js');

    const msg = {
      role: 'tool',
      name: 'test_tool',
      content: 'tool output',
      id: 'msg-tool',
    };
    const parsed = parseMessage(msg);

    expect(parsed.role).toBe('tool');
    expect(parsed.name).toBe('test_tool');
    expect(parsed.content).toBe('tool output');
  });
});
