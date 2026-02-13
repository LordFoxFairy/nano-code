import readline from 'readline';
import chalk from 'chalk';
import { Session } from './session.js';
import { CommandHandler } from './commands.js';
import { StreamingRenderer } from './renderer.js';
import { parseMessage, MessageLike } from './message-utils.js';
import { KeybindingManager, KeyAction } from './keybindings.js';

interface ToolCall {
  name?: string;
  args?: Record<string, unknown>;
}

interface StreamChunk {
  messages?: unknown[];
  tool_calls?: ToolCall[];
}

import { FileAutocomplete } from './autocomplete.js';

export class REPL {
  private rl: readline.Interface;
  private commandHandler: CommandHandler;
  private renderer: StreamingRenderer;
  private keybindingManager: KeybindingManager;
  private fileAutocomplete: FileAutocomplete;
  private isStreaming: boolean = false;
  private abortController: AbortController | null = null;
  private history: string[] = [];

  constructor(
    private agent: { stream: (input: unknown, config: unknown) => Promise<AsyncIterable<unknown>> },
    private session: Session,
  ) {
    this.fileAutocomplete = new FileAutocomplete();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      completer: (line: string, callback: (err: any, result: [string[], string]) => void) => {
        this.fileAutocomplete.complete(line).then(
          (result) => callback(null, result),
          (err) => callback(err, [[], line])
        );
      }
    });

    this.commandHandler = new CommandHandler(session);
    this.renderer = new StreamingRenderer(process.stdout);
    this.keybindingManager = new KeybindingManager();

    this.setupSignalHandlers();
    this.setupKeybindings();
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
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
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

      for await (const rawChunk of stream) {
        const chunk = rawChunk as StreamChunk;

        // Handle LangGraph values stream (returns full state)
        if (chunk.messages && Array.isArray(chunk.messages)) {
          for (const msg of chunk.messages) {
            const parsedMsg = parseMessage(msg as MessageLike);
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
        if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
          for (const toolCall of chunk.tool_calls) {
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
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        console.log(chalk.yellow('\nRequest aborted.'));
      } else {
        throw err;
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

  /**
   * Setup keybindings for special keyboard shortcuts
   */
  private setupKeybindings() {
    // Note: readline keypress events are limited in what they can capture
    // For more advanced keybindings, consider using a library like keypress or blessed
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      // The keypress handler is already handled by readline
      // We use the signal handlers for Ctrl+C and could extend for others

      // Handle Ctrl+L for clear screen via readline
      this.rl.on('line', () => {});

      // For Ctrl+L, we can use the SIGWINCH-like approach or just document it
      // Most terminals handle Ctrl+L natively for clear screen
    }
  }

  /**
   * Clear the terminal screen
   */
  private clearScreen() {
    process.stdout.write('\x1B[2J\x1B[0f');
    this.rl.prompt();
  }

  /**
   * Handle a keybinding action
   */
  private handleKeyAction(action: KeyAction) {
    switch (action) {
      case KeyAction.ABORT:
        if (this.isStreaming && this.abortController) {
          this.abortController.abort();
        }
        break;
      case KeyAction.CLEAR_SCREEN:
        this.clearScreen();
        break;
      case KeyAction.HISTORY_SEARCH:
        console.log(chalk.dim('\nHistory search not yet implemented.'));
        this.rl.prompt();
        break;
      case KeyAction.OPEN_EDITOR:
        console.log(chalk.dim('\nExternal editor not yet implemented.'));
        this.rl.prompt();
        break;
      default:
        // No action
        break;
    }
  }
}
