// src/cli/renderer.ts
import chalk from 'chalk';
import ora from 'ora';

export interface RenderAction {
    type: 'text' | 'tool_call_start' | 'tool_result' | 'thinking' | 'error';
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
        switch (action.type) {
            case 'text':
                // For text, we write directly to output
                this.outputStream.write(action.content || '');
                break;

            case 'tool_call_start':
                this.outputStream.write('\n');
                this.spinner = ora({
                    text: `Running ${chalk.cyan(action.toolName ?? 'unknown tool')}...`,
                    stream: this.outputStream
                }).start();
                break;

            case 'tool_result':
                const toolResult = action;
                if (this.spinner) {
                    if (toolResult.success) {
                        this.spinner.succeed(`Completed ${chalk.cyan(toolResult.toolName ?? 'unknown tool')}`);
                    } else {
                        this.spinner.fail(`Failed ${chalk.cyan(toolResult.toolName ?? 'unknown tool')}`);
                    }
                    this.spinner = null;
                }

                // Show result preview if available
                if (toolResult.result) {
                    this.outputStream.write(chalk.dim(this.truncate(toolResult.result, 100)) + '\n');
                }
                break;

            case 'thinking':
                 this.outputStream.write(chalk.dim(action.content) + '\n');
                 break;

            case 'error':
                 this.outputStream.write(chalk.red(action.content) + '\n');
                 break;
        }
    }

    private truncate(str: string, n: number) {
        return (str.length > n) ? str.slice(0, n - 1) + '...' : str;
    }
}
