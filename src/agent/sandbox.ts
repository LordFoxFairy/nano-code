import { BaseSandbox, ExecuteResponse, FileOperationError } from 'deepagents';
import { ShellSession } from './shell-session.js';
import path from 'path';
import fs from 'fs-extra';

export class LocalSandbox extends BaseSandbox {
  readonly id = 'local';
  private session: ShellSession;

  constructor(cwd: string) {
    super();
    this.session = new ShellSession(cwd);
  }

  async execute(command: string): Promise<ExecuteResponse> {
    const result = await this.session.execute(command);
    return {
      output: [result.stdout, result.stderr].filter(Boolean).join('\n'),
      exitCode: result.code,
      truncated: false,
    };
  }

  // Implement file transfer methods required by BaseSandbox
  // Note: These methods operate relative to the current CWD of the session

  async uploadFiles(files: [string, Uint8Array][]): Promise<
    Array<{
      path: string;
      error: FileOperationError | null;
    }>
  > {
    const responses: Array<{ path: string; error: FileOperationError | null }> = [];
    for (const [relativePath, content] of files) {
      try {
        const fullPath = path.resolve(this.session.getCwd(), relativePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.outputFile(fullPath, content);
        responses.push({ path: relativePath, error: null });
      } catch (e: unknown) {
        // Map generic errors to permission_denied as closest match
        responses.push({ path: relativePath, error: 'permission_denied' });
      }
    }
    return responses;
  }

  async downloadFiles(paths: string[]): Promise<
    Array<{
      path: string;
      content: Uint8Array | null;
      error: FileOperationError | null;
    }>
  > {
    const results: Array<{
      path: string;
      content: Uint8Array | null;
      error: FileOperationError | null;
    }> = [];
    for (const p of paths) {
      try {
        const fullPath = path.resolve(this.session.getCwd(), p);
        if (await fs.pathExists(fullPath)) {
          const stats = await fs.stat(fullPath);
          if (stats.isFile()) {
            const content = await fs.readFile(fullPath);
            results.push({ path: p, content, error: null });
          } else {
            results.push({ path: p, content: null, error: 'is_directory' });
          }
        } else {
          results.push({ path: p, content: null, error: 'file_not_found' });
        }
      } catch (e: unknown) {
        results.push({ path: p, content: null, error: 'permission_denied' });
      }
    }
    return results;
  }
}
