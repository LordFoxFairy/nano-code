import chalk from 'chalk';
import { Session } from './session.js';

export interface CommandResult {
  success: boolean;
  output: string;
}

export class CommandHandler {
  constructor(
    private _agent: any,
    private session: Session,
  ) {
    // Suppress unused error for now, will be used later
    void this._agent;
  }

  async handle(input: string): Promise<CommandResult> {
    const { command, args } = this.parse(input);

    switch (command) {
      case '/help':
        return this.handleHelp();
      case '/model':
        return this.handleModel(args);
      case '/clear':
        return this.handleClear();
      case '/exit':
        process.exit(0);
      default:
        return { success: false, output: `Unknown command: ${command}` };
    }
  }

  parse(input: string): { command: string; args: string[] } {
    const parts = input.trim().split(/\s+/);
    return {
      command: parts[0] || '',
      args: parts.slice(1),
    };
  }

  private handleHelp(): CommandResult {
    const helpText = [
      chalk.bold('Available Commands:'),
      '  /help           Show this help message',
      '  /model [name]   Switch model (opus, sonnet, haiku)',
      '  /clear          Clear conversation context (starts new thread)',
      '  /exit           Exit NanoCode',
      '  /bug            Report a bug (not implemented)',
      '  /cost           Show current session cost (not implemented)',
    ].join('\n');

    return { success: true, output: helpText };
  }

  private handleModel(args: string[]): CommandResult {
    const model = args[0];
    const validModels = ['opus', 'sonnet', 'haiku'];

    if (!model || !validModels.includes(model)) {
      return {
        success: false,
        output: `Invalid model. Available models: ${validModels.join(', ')}`,
      };
    }

    this.session.setMode(model);
    return { success: true, output: `Switched to ${chalk.green(model)} mode.` };
  }

  private handleClear(): CommandResult {
    this.session.clear();
    return { success: true, output: 'Context cleared. Started new conversation thread.' };
  }
}
