import readline from 'readline';
import chalk from 'chalk';
import { Session } from './session.js';
import { CommandHandler } from './commands.js';
import { StreamingRenderer } from './renderer.js';
import { parseMessage } from './message-utils.js';

export class REPL {
  private rl: readline.Interface;
  private commandHandler: CommandHandler;
  private renderer: StreamingRenderer;
  private isStreaming: boolean = false;
  private abortController: AbortController | null = null;
  private history: string[] = [];

  // Use any to avoid "excessively deep" type instantiation with LangGraph types
  // The actual interface is compatible with stream()
  constructor(
    private agent: any,
    private session: Session,
  ) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
    });

    this.commandHandler = new CommandHandler(agent, session);
    this.renderer = new StreamingRenderer(process.stdout);

    this.setupSignalHandlers();
  }

  private getPrompt(): string {
     const mode = this.session?.mode || 'sonnet';
     return `${chalk.blue('╭─')} ${chalk.bold('NanoCode')} ${chalk.dim(`(${mode})`)}
${chalk.blue('╰─>')} `;
  }

  async start() {
    this.updatePrompt();
    console.log(chalk.bold('\nWelcome to NanoCode'));
    console.log(chalk.dim('Type /help for available commands or start typing to chat.\n'));

    this.rl.prompt();

    for await (const line of this.rl) {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        continue;
      }

      // Basic multi-line support (very simple for now)
      if (input.endsWith('\\')) {
         // This would require more complex readline handling to support continuation
         // For now, let's just process single inputs or paste
      }

      this.history.push(input);

      try {
        if (this.isSlashCommand(input)) {
          await this.handleSlashCommand(input);
        } else {
          await this.handleNormalInput(input);
        }
      } catch (error: any) {
        this.renderer.render({ type: 'error', content: error.message });
      }

      this.updatePrompt();
      this.rl.prompt();
    }
  }

  private updatePrompt() {
    this.rl.setPrompt(this.getPrompt());
  }

  isSlashCommand(input: string): boolean {
    return input.startsWith('/');
  }

  private async handleSlashCommand(input: string) {
    const result = await this.commandHandler.handle(input);
    if (result.success) {
      console.log(result.output);
      // Reload prompt if needed (e.g. mode change)
      this.updatePrompt();
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
            const parsedMsg = parseMessage(msg);
            const { role, content, toolCalls, id: msgId, name, isError } = parsedMsg;

            // console.log(`Debug msg: role=${role}, id=${msgId}, content=${content?.toString().substring(0, 20)}, processed=${processedMessages.has(msgId)}`);

            if (!processedMessages.has(msgId) && role === 'assistant') {
              processedMessages.add(msgId);

              // Check if we already rendered this content (simple dedup for streaming hiccups)
              if (processedMessages.has(`${msgId}_rendered`)) {
                 continue;
              }
              processedMessages.add(`${msgId}_rendered`);

              if (content) {
                  this.renderer.render({ type: 'text', content: content });
                  fullResponse += content;
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
      // Render full response nicely if it was text
      if (fullResponse) {
         // Optionally re-render nicely if needed, but we already streamed it.
         // Maybe just clear previous lines? No, that's risky.
         // Let's use the renderer to print a nice divider or something
      }
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
