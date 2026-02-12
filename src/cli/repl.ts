import readline from 'readline';
import chalk from 'chalk';
import { Session } from './session.js';
import { CommandHandler } from './commands.js';
import { StreamingRenderer } from './renderer.js';

export class REPL {
  private rl: readline.Interface;
  private commandHandler: CommandHandler;
  private renderer: StreamingRenderer;
  private isStreaming: boolean = false;
  private abortController: AbortController | null = null;

  // Use any to avoid "excessively deep" type instantiation with LangGraph types
  // The actual interface is compatible with stream()
  constructor(
    private agent: any,
    private session: Session,
  ) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue('> '),
    });

    this.commandHandler = new CommandHandler(agent, session);
    this.renderer = new StreamingRenderer(process.stdout);

    this.setupSignalHandlers();
  }

  async start() {
    console.log(chalk.bold('Welcome to NanoCode'));
    console.log(chalk.dim('Type /help for available commands\n'));

    this.rl.prompt();

    for await (const line of this.rl) {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        continue;
      }

      try {
        if (this.isSlashCommand(input)) {
          await this.handleSlashCommand(input);
        } else {
          await this.handleNormalInput(input);
        }
      } catch (error: any) {
        this.renderer.render({ type: 'error', content: error.message });
      }

      this.rl.prompt();
    }
  }

  isSlashCommand(input: string): boolean {
    return input.startsWith('/');
  }

  private async handleSlashCommand(input: string) {
    const result = await this.commandHandler.handle(input);
    if (result.success) {
      console.log(result.output);
    } else {
      console.log(chalk.red(result.output));
    }
  }

  private async handleNormalInput(input: string) {
    this.isStreaming = true;
    this.abortController = new AbortController();

    try {
      this.session.addMessage({ role: 'user', content: input });

      // Create a custom stream from the agent
      // This assumes agent.stream returns an async iterable of some chunks
      // We need to adapt deepagents stream format to our renderer format

      const stream = await this.agent.stream(
        { messages: [{ role: 'user', content: input }] },
        {
          configurable: { thread_id: this.session.threadId },
          signal: this.abortController.signal,
          streamMode: 'values',
        },
      );

      let fullResponse = '';
      let processedMessages = new Set<string>();

      for await (const chunk of stream) {
        // Handle LangGraph values stream (returns full state)
        if (chunk.messages && Array.isArray(chunk.messages)) {
          const messages = chunk.messages;

          // Process new messages we haven't seen yet
          for (const msg of messages) {

            // Normalize message data
            const role = msg.role || (msg.id?.includes('AIMessage') ? 'assistant' : (msg.id?.includes('HumanMessage') ? 'user' : (msg.id?.includes('ToolMessage') ? 'tool' : 'unknown')));
            const content = msg.content !== undefined ? msg.content : (msg.kwargs?.content);
            const toolCalls = msg.tool_calls || msg.kwargs?.tool_calls;
            const name = msg.name || msg.kwargs?.name;
            const isError = msg.is_error || msg.kwargs?.is_error;

            // Generate a unique ID for the message
            // Use msg.id if it's a string, or construct one
            const msgId = typeof msg.id === 'string'
              ? msg.id
              : (msg.id && Array.isArray(msg.id) ? msg.id.join('_') : `${role}-${typeof content === 'string' ? content.substring(0, 20) : 'obj'}`);

            if (!processedMessages.has(msgId) && role === 'assistant') {
              processedMessages.add(msgId);

              if (content) {
                // If it's a string content
                if (typeof content === 'string') {
                  this.renderer.render({ type: 'text', content: content });
                  fullResponse += content;
                } else if (Array.isArray(content)) {
                   // Handle array content (typically text + tool_use)
                   for (const part of content) {
                     if (part.type === 'text') {
                       this.renderer.render({ type: 'text', content: part.text });
                       fullResponse += part.text;
                     } else if (part.type === 'tool_use') {
                        this.renderer.render({
                          type: 'tool_call_start',
                          toolName: part.name,
                          args: part.input,
                        });
                        // We might want to show tool results too if they are in the message history
                     }
                   }
                }
              }

              if (toolCalls && toolCalls.length > 0) {
                 for (const toolCall of toolCalls) {
                    this.renderer.render({
                      type: 'tool_call_start',
                      toolName: toolCall.name,
                      args: toolCall.args,
                    });
                 }
              }
            }

            // Check for tool output messages to render results
            if (!processedMessages.has(msgId) && role === 'tool') {
               processedMessages.add(msgId);
               this.renderer.render({
                 type: 'tool_result',
                 toolName: name,
                 result: content,
                 success: !isError
               });
            }
          }
          continue;
        }

        // Original logic for direct chunks if not using 'values' mode...

        // Logic for tool calls would go here based on chunk structure
        if (chunk.tool_calls) {
          for (const toolCall of chunk.tool_calls) {
            this.renderer.render({
              type: 'tool_call_start',
              toolName: toolCall.name,
              args: toolCall.args,
            });
          }
        }
      }

      console.log('\n'); // Newline after stream
      this.session.addMessage({ role: 'assistant', content: fullResponse });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(chalk.yellow('\nRequest aborted.'));
      } else {
        throw error;
      }
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  private setupSignalHandlers() {
    process.on('SIGINT', () => {
      if (this.isStreaming && this.abortController) {
        this.abortController.abort();
      } else {
        console.log('\nPress Ctrl+C again to exit.');
        process.exit(0);
      }
    });
  }
}
