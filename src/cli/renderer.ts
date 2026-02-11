import chalk from 'chalk';
import ora from 'ora';

export interface RenderAction {
  type: 'text' | 'tool_call_start' | 'tool_result' | 'thinking' | 'error' | 'user_input';
  content?: string;
  toolName?: string;
  args?: any;
  success?: boolean;
  result?: string;
}

export class StreamingRenderer {
  private spinner: any;

  constructor(private outputStream: any = process.stdout) {}

  render(action: RenderAction) {
    // If spinner is active, stop it briefly to render text
    if (this.spinner && action.type !== 'tool_result') {
      // Don't stop spinner for text streaming unless it's a new line?
      // Actually, if we are streaming text while spinner is active, it's weird.
      // Usually text comes after tool result.
    }

    switch (action.type) {
      case 'text':
        // For text, we write directly to output
        this.outputStream.write(action.content || '');
        break;

      case 'tool_call_start':
        // Ensure we are on a new line
        this.outputStream.write('\n');
        this.spinner = ora({
          text: `Running ${chalk.cyan(action.toolName ?? 'unknown tool')}...`,
          stream: this.outputStream,
        }).start();
        break;

      case 'tool_result':
        if (this.spinner) {
          if (action.success !== false) { // Default to true if undefined
            this.spinner.succeed(`Completed ${chalk.cyan(action.toolName ?? 'unknown tool')}`);
          } else {
            this.spinner.fail(`Failed ${chalk.cyan(action.toolName ?? 'unknown tool')}`);
          }
          this.spinner = null;
        }

        // Show result preview if available
        if (action.result) {
          // indent the result slightly
          const indentedResult = action.result.split('\n').map(line => '  ' + line).join('\n');
          this.outputStream.write(chalk.dim(this.truncate(indentedResult, 300)) + '\n');
        }
        break;

      case 'thinking':
        this.outputStream.write(chalk.dim(action.content) + '\n');
        break;

      case 'error':
        if (this.spinner) {
            this.spinner.fail('Error');
            this.spinner = null;
        }
        this.outputStream.write(chalk.red(action.content) + '\n');
        break;

      case 'user_input':
        // Just for logging if needed
        break;
    }
  }

  private truncate(str: string, n: number) {
    if (str.length <= n) return str;
    return str.slice(0, n) + '... (truncated)';
  }
}
