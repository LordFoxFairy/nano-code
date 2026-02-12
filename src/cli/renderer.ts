import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { highlight } from 'cli-highlight';
import boxen from 'boxen';

// Configure marked for terminal output
marked.setOptions({
  // @ts-expect-error - marked-terminal types are sometimes tricky
  renderer: new TerminalRenderer({
    // @ts-expect-error - marked-terminal seems to have issues with type definitions for code
    code: (code: any, lang: any) => {
      try {
        return highlight(code, { language: lang || 'plaintext', ignoreIllegals: true });
      } catch (e) {
        return code;
      }
    },
    // Customize other renderers if needed
    width: process.stdout.columns || 80,
    reflowText: true,
  }),
});

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
  private currentTool: string | null = null;

  constructor(private outputStream: any = process.stdout) {}

  render(action: RenderAction) {
    if (this.spinner && action.type !== 'tool_result') {
      // If we get text/thinking while spinner is running, we should probably stop the spinner temporarily
      // or just print above/below it. For now, let's keep it simple.
    }

    switch (action.type) {
      case 'text':
        // Markdown rendering for text
        // Note: Streaming markdown is tricky because marked expects complete strings.
        // For a true streaming experience with markdown, we might need a streaming markdown parser or
        // just buffer by line/block. For now, since the chunks are small, repeated parsing might be expensive
        // and cause flickering.
        // A simple approach for CLI is:
        // 1. Just write raw text for now during stream
        // 2. Or if "content" is the full accumulated text (which it is in my REPL implementation), we might need to clear and re-render?
        // Wait, REPL implementation:
        // this.renderer.render({ type: 'text', content: content }); -> "content" is just the chunk.

        // If we want markdown, we can't easily do it on chunks unless we buffer line by line or use a specialized tool.
        // BUT, the prompt said "Markdown rendering".
        // Let's assume for now we just write the chunk.
        // OPTION: We can't apply markdown to partial chunks easily.
        // However, we can apply syntax highlighting to code blocks if we detect them.

        // Let's just output raw text during streaming for now to ensure responsiveness,
        // but maybe we can format it better if it's a "final" render.
        // Actually, looking at the REPL logic:
        // fullResponse += content;
        // ...
        // AFTER stream loop:
        // this.session.addMessage(...)

        // We might want to re-render the FULL message as Markdown at the end?
        // Or we can try to render line-by-line using a buffer.

        this.outputStream.write(action.content || '');
        break;

      case 'tool_call_start':
        this.outputStream.write('\n'); // Ensure separation
        this.currentTool = action.toolName || 'unknown';
        this.spinner = ora({
          text: `${chalk.bold('Executing')} ${chalk.cyan(this.currentTool)}...`,
          spinner: 'dots',
          color: 'cyan',
        }).start();

        // If we have args, maybe show them nicely?
        if (action.args) {
          const argsStr = JSON.stringify(action.args, null, 2);
          if (argsStr.length < 100) {
            this.spinner.text += chalk.dim(` ${argsStr}`);
          }
        }
        break;

      case 'tool_result':
        if (this.spinner) {
          const toolName = action.toolName || this.currentTool || 'tool';

          if (action.success !== false) {
            this.spinner.succeed(chalk.green(`Executed ${chalk.bold(toolName)}`));
          } else {
            this.spinner.fail(chalk.red(`Failed ${chalk.bold(toolName)}`));
          }
          this.spinner = null;
        }

        // Show result
        if (action.result) {
          const resultPreview = this.formatToolResult(action.result);
          console.log(resultPreview);
        }
        break;

      case 'thinking':
        console.log(chalk.dim('Thinking: ') + action.content);
        break;

      case 'error':
        if (this.spinner) {
          this.spinner.fail('Error occurred');
          this.spinner = null;
        }
        console.log(
          boxen(chalk.red(action.content || 'Unknown error'), {
            title: 'Error',
            titleAlignment: 'left',
            borderColor: 'red',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
          }),
        );
        break;
    }
  }

  // Method to render the final full message with Markdown support
  renderFinalMessage(content: string) {
    // Use marked to render the full markdown content
    const rendered = marked(content);
    console.log('\n' + rendered);
  }

  private formatToolResult(result: string): string {
    // Truncate long outputs
    const MAX_LINES = 10;
    const lines = result.split('\n');
    let output = result;
    let truncated = false;

    if (lines.length > MAX_LINES) {
      output = lines.slice(0, MAX_LINES).join('\n');
      truncated = true;
    }

    // Add box/styling
    const formatted = boxen(output + (truncated ? chalk.dim('\n... (output truncated)') : ''), {
      title: 'Result',
      titleAlignment: 'left',
      borderColor: 'gray',
      borderStyle: 'round',
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      dimBorder: true,
    });

    return formatted;
  }

  // @ts-expect-error - Reserved for future use
  private truncate(str: string, n: number) {
    if (str.length <= n) return str;
    return str.slice(0, n) + '... (truncated)';
  }
}
