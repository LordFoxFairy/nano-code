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

    this.commandHandler = new CommandHandler(session);
    this.renderer = new StreamingRenderer(process.stdout);

    this.setupSignalHandlers();
  }

  private getPrompt(): string {
    const mode = this.session.mode || 'sonnet';
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

      // Basic multi-line support could go here (e.g. checking for backslash)
      // For now, we process each line as a complete input

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

      // If this was a skill trigger, we need to send the context to the agent
      // We essentially treat it as a user message but injected with skill context
      if (result.skillContext) {
        // Construct a message that tells the agent to use this skill
        // We include the original command for context, but primarily the skill definition
        const skillMessage = `User triggered skill command: ${input}\n\nSkill Context:\n${result.skillContext}`;
        await this.handleNormalInput(skillMessage);
      } else {
        // Reload prompt if needed (e.g. mode change)
        this.updatePrompt();
      }
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
      const processedMessages = new Set<string>();

      for await (const chunk of stream) {
        // Handle LangGraph values stream (returns full state)
        if (chunk.messages && Array.isArray(chunk.messages)) {
          const messages = chunk.messages;

          // Process new messages we haven't seen yet
          for (const msg of messages) {
            const parsedMsg = parseMessage(msg);
            const { role, content, toolCalls, id: msgId, name, isError } = parsedMsg;

            // Optional debug log
            // console.log(`Msg: ${role}, ${msgId}`);

            if (!processedMessages.has(msgId) && role === 'assistant') {
              processedMessages.add(msgId);

              // Check if we already rendered this content
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
                    toolName: toolCall.name ?? 'unknown_tool',
                    args: toolCall.args ?? {},
                  });
                }
              }
            }

            // Check for tool output messages to render results
            if (!processedMessages.has(msgId) && role === 'tool') {
              processedMessages.add(msgId);
              this.renderer.render({
                type: 'tool_result',
                toolName: name ?? 'unknown',
                result: content,
                success: !isError,
              });
            }
          }
        }

        // Handle direct chunks if tool_calls not in messages (for streaming modes other than 'values')
        if (
          chunk &&
          typeof chunk === 'object' &&
          'tool_calls' in chunk &&
          Array.isArray((chunk as any).tool_calls)
        ) {
          for (const toolCall of (chunk as any).tool_calls) {
            this.renderer.render({
              type: 'tool_call_start',
              toolName: toolCall.name ?? 'unknown',
              args: toolCall.args ?? {},
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
