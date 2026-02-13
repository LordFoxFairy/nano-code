import { z } from 'zod';
import { StructuredTool } from '@langchain/core/tools';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { pathToFileURL } from 'url';

// --- LSP Types ---

interface LSPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface LSPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface LSPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

// --- Language Server Configuration ---

interface LanguageServerConfig {
  command: string;
  args: string[];
  languages: string[];
}

const SERVER_CONFIGS: LanguageServerConfig[] = [
  {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
  },
  {
    command: 'pylsp',
    args: [],
    languages: ['python'],
  },
  {
    command: 'rust-analyzer',
    args: [],
    languages: ['rust'],
  },
  {
    command: 'gopls',
    args: [],
    languages: ['go'],
  },
  {
    command: 'clangd',
    args: [],
    languages: ['c', 'cpp', 'objective-c'],
  },
];

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
};

// --- Simple LSP Client ---

class SimpleLSPClient {
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private messageQueue: any[] = [];
  private pendingRequests: Map<string | number, (resolve: any, reject: any) => void> = new Map();
  private diagnostics: Map<string, any[]> = new Map();
  private initialized = false;

  constructor(
    public readonly language: string,
    private config: LanguageServerConfig
  ) {}

  get command(): string {
    return this.config.command;
  }

  async start(rootPath: string) {
    if (this.process) return;

    try {
      this.process = spawn(this.config.command, this.config.args, {
        cwd: rootPath,
        env: process.env,
      });

      this.process.stdout?.on('data', (data) => this.handleData(data));
      this.process.stderr?.on('data', (data) => {
        // Log stderr but don't treat as fatal error unless process exits
        // console.error(`LSP Stderr (${this.language}): ${data}`);
      });

      this.process.on('error', (err) => {
        console.error(`LSP Process Error (${this.language}):`, err);
        this.stop();
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`LSP Process Exited (${this.language}) with code ${code}`);
        }
        this.stop();
      });

      // Initialize
      await this.initialize(rootPath);
      this.initialized = true;
    } catch (error) {
       console.error(`Failed to start LSP server for ${this.language}:`, error);
       throw error;
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests.forEach((_, __, map) => {
       // specific implementation might reject all pending
    });
    this.pendingRequests.clear();
    this.initialized = false;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private handleData(data: Buffer) {
    this.buffer += data.toString();

    while (true) {
      const lengthMatch = this.buffer.match(/Content-Length: (\d+)\r\n/);
      if (!lengthMatch) break;

      const contentLength = parseInt(lengthMatch[1], 10);
      const headerEndIndex = this.buffer.indexOf('\r\n\r\n');

      if (headerEndIndex === -1) break;

      const bodyStartIndex = headerEndIndex + 4;
      const totalLength = bodyStartIndex + contentLength;

      if (this.buffer.length < totalLength) break;

      const messageBody = this.buffer.slice(bodyStartIndex, totalLength);
      this.buffer = this.buffer.slice(totalLength);

      try {
        const message = JSON.parse(messageBody);
        this.handleMessage(message);
      } catch (e) {
        console.error('Error parsing LSP message:', e);
      }
    }
  }

  private handleMessage(message: any) {
    if (message.method === 'textDocument/publishDiagnostics') {
      const params = message.params;
      this.diagnostics.set(params.uri, params.diagnostics);
    } else if (message.id !== undefined) {
      // Response
      if (this.pendingRequests.has(message.id)) {
        const handler = this.pendingRequests.get(message.id); // handler is {resolve, reject} or just resolve?
        // Logic: I stored `(resolve, reject) => void`? No, I stored a callback or object?
        // Let's correct how I store it.
      }
      const requestResolver = this.pendingRequests.get(message.id);
      if (requestResolver) {
        requestResolver(message.result, message.error);
        this.pendingRequests.delete(message.id);
      }
    } else {
        // Notification
    }
  }

  async sendRequest<T>(method: string, params: any): Promise<T> {
    if (!this.process) throw new Error('LSP server not running');

    const id = uuidv4();
    const message: LSPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const payload = JSON.stringify(message);
    const contentLength = Buffer.byteLength(payload, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, (result: any, error: any) => {
        if (error) reject(error);
        else resolve(result);
      });

      try {
        this.process!.stdin?.write(header + payload);
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP Request timeout: ${method}`));
        }
      }, 10000);
    });
  }

  sendNotification(method: string, params: any) {
    if (!this.process) return;

    const message: LSPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const payload = JSON.stringify(message);
    const contentLength = Buffer.byteLength(payload, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;

    try {
      this.process.stdin?.write(header + payload);
    } catch (e) {
      console.error('Failed to send notification', e);
    }
  }

  async initialize(rootPath: string) {
    await this.sendRequest('initialize', {
      processId: process.pid,
      rootPath,
      rootUri: pathToFileURL(rootPath).toString(),
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            didChange: true,
          },
          completion: {
             completionItem: {
                snippetSupport: true,
             }
          },
          hover: {},
          definition: {},
          references: {},
          publishDiagnostics: {}
        },
      },
    });
    this.sendNotification('initialized', {});
  }

  getStoredDiagnostics(uri: string): any[] {
    return this.diagnostics.get(uri) || [];
  }
}

// --- LSP Tool ---

export class LSPTool extends StructuredTool {
  name = 'lsp_tool';
  description = `Code intelligence tool using Language Server Protocol (LSP).
Provides diagnostics (errors/warnings), definition lookups, references, hover info, and completions.
Supported actions:
- 'diagnostics': Get errors and warnings for a file
- 'definition': Jump to definition of symbol at line/char
- 'references': Find all references of symbol at line/char
- 'hover': Get documentation/type info at line/char
- 'completions': Get code completions at line/char

Notes:
- Requires appropriate language server installed (typescript-language-server, pylsp, etc.)
- Auto-detects language from file extension
- Automatically starts server if needed
`;

  schema = z.object({
    action: z.enum(['diagnostics', 'definition', 'references', 'hover', 'completions']).describe('The action to perform'),
    uri: z.string().describe('The file path or URI (e.g. /path/to/file.ts)'),
    line: z.number().optional().describe('Line number (0-based)'),
    character: z.number().optional().describe('Character number (0-based)'),
  });

  private clients: Map<string, SimpleLSPClient> = new Map();
  private documentsOpened: Set<string> = new Set();

  constructor() {
    super();
  }

  private getLanguage(ext: string): string | undefined {
    return EXTENSION_TO_LANGUAGE[ext];
  }

  private async getClient(filePath: string): Promise<SimpleLSPClient> {
    const ext = path.extname(filePath);
    const language = this.getLanguage(ext);

    if (!language) {
      throw new Error(`Unsupported file extension: ${ext}`);
    }

    let client = this.clients.get(language);
    if (!client) {
      const config = SERVER_CONFIGS.find(c => c.languages.includes(language));
      if (!config) {
        throw new Error(`No language server configured for ${language}`);
      }
      client = new SimpleLSPClient(language, config);
      this.clients.set(language, client);
    }

    if (!client.isRunning()) {
      // Find project root - naïve approach: directory of file or git root
      // For now, use file's directory or cwd
      const rootPath = process.cwd();
      try {
        await client.start(rootPath);
      } catch (e) {
          throw new Error(`Failed to start language server for ${language}. Make sure '${client.command}' is installed.`);
      }
    }

    return client;
  }

  private async ensureDocumentOpen(client: SimpleLSPClient, filePath: string) {
    const uri = pathToFileURL(filePath).toString();
    if (!this.documentsOpened.has(uri)) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        client.sendNotification('textDocument/didOpen', {
          textDocument: {
            uri,
            languageId: client.language,
            version: 1,
            text: content,
          },
        });
        this.documentsOpened.add(uri);
      } catch (e) {
         console.warn(`Failed to open document ${filePath}:`, e);
      }
    }
  }

  async _call(input: {
    action: 'diagnostics' | 'definition' | 'references' | 'hover' | 'completions';
    uri: string;
    line?: number;
    character?: number;
  }): Promise<string> {
    const { action, uri: fileInput, line = 0, character = 0 } = input;

    // Normalize path
    let filePath = fileInput;
    if (fileInput.startsWith('file://')) {
        filePath = fileInput.replace('file://', '');
    }
    // Ensure absolute path
    if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(process.cwd(), filePath);
    }
    const uri = pathToFileURL(filePath).toString();

    try {
        const client = await this.getClient(filePath);
        await this.ensureDocumentOpen(client, filePath);

        switch (action) {
            case 'diagnostics':
                return this.getDiagnostics(client, uri);
            case 'definition':
                return this.gotoDefinition(client, uri, line, character);
            case 'references':
                return this.findReferences(client, uri, line, character);
            case 'hover':
                return this.hover(client, uri, line, character);
            case 'completions':
                return this.getCompletions(client, uri, line, character);
            default:
                return `Unknown action: ${action}`;
        }
    } catch (e: any) {
        return `Error performing ${action}: ${e.message}`;
    }
  }

  async getDiagnostics(client: SimpleLSPClient, uri: string): Promise<string> {
      // Diagnostics are pushed via notification. We can check stored diagnostics.
      // However, to ensure they are up to date, we might want to wait a bit or assume they are current if the file is open.
      // A dummy edit or verify logic is sometimes used, but for now return what we have.
      const diagnostics = client.getStoredDiagnostics(uri);

      if (!diagnostics || diagnostics.length === 0) {
          return `No diagnostics found for ${uri}`;
      }

      return diagnostics.map(d => {
          const range = `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`;
          const severity = d.severity === 1 ? 'Error' : d.severity === 2 ? 'Warning' : 'Info';
          return `[${severity}] ${range}: ${d.message}`;
      }).join('\n');
  }

  async gotoDefinition(client: SimpleLSPClient, uri: string, line: number, character: number): Promise<string> {
      const result: any = await client.sendRequest('textDocument/definition', {
          textDocument: { uri },
          position: { line, character }
      });

      if (!result) return 'No definition found.';

      const locations = Array.isArray(result) ? result : [result];
      if (locations.length === 0) return 'No definition found.';

      return locations.map((loc: any) => {
          return `Definition at: ${loc.uri} ${loc.range.start.line}:${loc.range.start.character}`;
      }).join('\n');
  }

  async findReferences(client: SimpleLSPClient, uri: string, line: number, character: number): Promise<string> {
      const result: any = await client.sendRequest('textDocument/references', {
          textDocument: { uri },
          position: { line, character },
          context: { includeDeclaration: true }
      });

      if (!result || !Array.isArray(result)) return 'No references found.';

      return result.map((loc: any) => {
          return `Reference at: ${loc.uri} ${loc.range.start.line}:${loc.range.start.character}`;
      }).join('\n');
  }

  async hover(client: SimpleLSPClient, uri: string, line: number, character: number): Promise<string> {
      const result: any = await client.sendRequest('textDocument/hover', {
          textDocument: { uri },
          position: { line, character }
      });

      if (!result || !result.contents) return 'No hover info.';

      let contents = result.contents;
      if (typeof contents === 'object' && contents.kind === 'markdown') {
          contents = contents.value;
      } else if (Array.isArray(contents)) {
          contents = contents.map((c: any) => typeof c === 'string' ? c : c.value).join('\n');
      } else if (typeof contents === 'object' && contents.value) {
          contents = contents.value;
      }

      // Convert from object to string if needed
      if (typeof contents !== 'string') {
        contents = JSON.stringify(contents);
      }

      return `Hover: ${contents}`;
  }

  async getCompletions(client: SimpleLSPClient, uri: string, line: number, character: number): Promise<string> {
      const result: any = await client.sendRequest('textDocument/completion', {
          textDocument: { uri },
          position: { line, character }
      });

      if (!result) return 'No completions found.';

      let items = Array.isArray(result) ? result : result.items;

      // Limit to top 20
      items = items.slice(0, 20);

      return items.map((item: any) => {
          return `- ${item.label} (${item.kind ? this.getCompletionKind(item.kind) : 'unknown'})`;
      }).join('\n');
  }

  private getCompletionKind(kind: number): string {
      const kinds = [
          'Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property',
          'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember',
          'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'
      ];
      return kinds[kind - 1] || 'Unknown';
  }
}
