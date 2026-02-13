import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import {
  LSPServerConfig,
  LSPLocation,
  LSPCompletionItem,
  LSPHover,
  LSPDefinition,
  LSPReference,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
} from './types.js';

class LSPServer extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: LSPServerConfig;
  private messageBuffer: string = '';
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }> = new Map();
  private initialized: boolean = false;
  private capabilities: any = {};
  public language: string;

  constructor(language: string, config: LSPServerConfig) {
    super();
    this.language = language;
    this.config = config;
  }

  public async start(): Promise<void> {
    if (this.process) {
      return;
    }

    try {
      this.process = spawn(this.config.command, this.config.args, {
        cwd: this.config.rootUri.replace('file://', ''),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[LSP ${this.language} stderr]: ${data.toString()}`);
      });

      this.process.on('error', (err) => {
        console.error(`[LSP ${this.language} error]:`, err);
        this.emit('error', err);
      });

      this.process.on('exit', (code) => {
        console.log(`[LSP ${this.language}] exited with code ${code}`);
        this.process = null;
        this.initialized = false;
        this.emit('exit', code);
      });

      // Initialize the server
      await this.initialize();
    } catch (error) {
      console.error(`[LSP ${this.language}] Failed to start:`, error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      await this.sendRequest('shutdown', {});
      this.sendNotification('exit', {});
    } catch (error) {
      console.error(`[LSP ${this.language}] Error stopping server:`, error);
    } finally {
      if (this.process) {
        this.process.kill();
        this.process = null;
      }
      this.initialized = false;
    }
  }

  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    while (true) {
      // Check if we have a full header
      const headerMatch = this.messageBuffer.match(/^Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) {
        break;
      }

      const contentLength = parseInt(headerMatch[1], 10);
      const headerLength = headerMatch[0].length;

      // Check if we have the full body
      if (this.messageBuffer.length < headerLength + contentLength) {
        break;
      }

      const messageBody = this.messageBuffer.slice(headerLength, headerLength + contentLength);
      this.messageBuffer = this.messageBuffer.slice(headerLength + contentLength);

      try {
        const message = JSON.parse(messageBody);
        this.handleMessage(message);
      } catch (error) {
        console.error(`[LSP ${this.language}] Failed to parse message:`, error);
      }
    }
  }

  private handleMessage(message: JSONRPCMessage): void {
    // Handle Response
    if ('id' in message && (message as JSONRPCResponse).result !== undefined || (message as JSONRPCResponse).error !== undefined) {
      const response = message as JSONRPCResponse;
      const id = typeof response.id === 'string' ? parseInt(response.id) : response.id;

      if (id !== null && this.pendingRequests.has(id)) {
        const { resolve, reject } = this.pendingRequests.get(id)!;
        this.pendingRequests.delete(id);

        if (response.error) {
          reject(response.error);
        } else {
          resolve(response.result);
        }
      }
    }
    // Handle Request (from server to client)
    else if ('method' in message && 'id' in message) {
      // We don't support server-to-client requests yet, but logging for debug
      // console.log(`[LSP ${this.language}] Received request:`, message);
    }
    // Handle Notification
    else if ('method' in message) {
      const notification = message as JSONRPCNotification;
      this.emit('notification', notification);

      if (notification.method === 'textDocument/publishDiagnostics') {
        this.emit('diagnostics', notification.params);
      }
    }
  }

  public async sendRequest<T>(method: string, params: any): Promise<T> {
    if (!this.process) {
      throw new Error(`LSP server for ${this.language} is not running`);
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const message = JSON.stringify(request);
    const contentLength = Buffer.byteLength(message, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin?.write(header + message);
    });
  }

  public sendNotification(method: string, params: any): void {
    if (!this.process) {
      return;
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const message = JSON.stringify(notification);
    const contentLength = Buffer.byteLength(message, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;

    this.process.stdin?.write(header + message);
  }

  private async initialize(): Promise<void> {
    const rootPath = this.config.rootUri.replace('file://', '');

    const params = {
      processId: process.pid,
      rootUri: this.config.rootUri,
      rootPath,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: true,
            willSaveWaitUntil: true,
            didSave: true,
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext'],
              deprecatedSupport: true,
              preselectSupport: true,
            },
            contextSupport: true,
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
            },
          },
          definition: {
            dynamicRegistration: true,
          },
          references: {
            dynamicRegistration: true,
          },
          documentHighlight: {
            dynamicRegistration: true,
          },
          documentSymbol: {
            dynamicRegistration: true,
            symbolKind: {
              valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
            },
          },
          codeAction: {
            dynamicRegistration: true,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: ['', 'quickfix', 'refactor', 'refactor.extract', 'refactor.inline', 'refactor.rewrite', 'source', 'source.organizeImports'],
              },
            },
          },
        },
        workspace: {
          applyEdit: true,
        },
      },
      trace: 'off',
      workspaceFolders: [
        {
          uri: this.config.rootUri,
          name: path.basename(rootPath),
        },
      ],
      initializationOptions: this.config.initializationOptions,
    };

    try {
      const result = await this.sendRequest<any>('initialize', params);
      this.capabilities = result.capabilities;
      this.initialized = true;
      this.sendNotification('initialized', {});
    } catch (error) {
      console.error(`[LSP ${this.language}] Initialize failed:`, error);
      throw error;
    }
  }

  // LSP Operations

  public didOpen(filePath: string, content: string): void {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.language,
        version: 1,
        text: content,
      },
    });
  }

  public didChange(filePath: string, content: string, version: number): void {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [
        {
          text: content,
        },
      ],
    });
  }

  public didSave(filePath: string): void {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    this.sendNotification('textDocument/didSave', {
      textDocument: {
        uri,
      },
    });
  }

  public didClose(filePath: string): void {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    this.sendNotification('textDocument/didClose', {
      textDocument: {
        uri,
      },
    });
  }

  public async getCompletion(filePath: string, line: number, character: number): Promise<LSPCompletionItem[]> {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    try {
      const result = await this.sendRequest<any>('textDocument/completion', {
        textDocument: { uri },
        position: { line, character },
      });

      if (Array.isArray(result)) {
        return result;
      }
      return result?.items || [];
    } catch (error) {
      console.error(`[LSP ${this.language}] Completion failed:`, error);
      return [];
    }
  }

  public async getHover(filePath: string, line: number, character: number): Promise<LSPHover | null> {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    try {
      return await this.sendRequest<LSPHover>('textDocument/hover', {
        textDocument: { uri },
        position: { line, character },
      });
    } catch (error) {
      console.error(`[LSP ${this.language}] Hover failed:`, error);
      return null;
    }
  }

  public async getDefinition(filePath: string, line: number, character: number): Promise<LSPDefinition | null> {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    try {
      return await this.sendRequest<LSPDefinition>('textDocument/definition', {
        textDocument: { uri },
        position: { line, character },
      });
    } catch (error) {
      console.error(`[LSP ${this.language}] Definition failed:`, error);
      return null;
    }
  }

  public async getReferences(filePath: string, line: number, character: number): Promise<LSPReference | null> {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    try {
      return await this.sendRequest<LSPReference>('textDocument/references', {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration: true },
      });
    } catch (error) {
      console.error(`[LSP ${this.language}] References failed:`, error);
      return null;
    }
  }
}

export class LSPManager {
  private servers: Map<string, LSPServer> = new Map();
  private rootUri: string;

  constructor(rootPath: string = process.cwd()) {
    this.rootUri = `file://${rootPath}`;
  }

  public detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'typescript';
      case '.py':
        return 'python';
      default:
        return null;
    }
  }

  public async startServer(language: string): Promise<LSPServer | null> {
    if (this.servers.has(language)) {
      return this.servers.get(language)!;
    }

    let config: LSPServerConfig | null = null;

    if (language === 'typescript') {
      config = {
        command: 'npx',
        args: ['typescript-language-server', '--stdio'],
        languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
        rootUri: this.rootUri,
      };
    } else if (language === 'python') {
      // Prefer python-lsp-server (pylsp) or pyright
      // We'll default to pylsp for now as it's common
      config = {
        command: 'python3', // or python
        args: ['-m', 'pylsp'],
        languages: ['python'],
        rootUri: this.rootUri,
      };
    }

    if (!config) {
      console.warn(`No LSP configuration found for language: ${language}`);
      return null;
    }

    const server = new LSPServer(language, config);
    this.servers.set(language, server);

    try {
      await server.start();
      console.log(`LSP Server initialized for ${language}`);
      return server;
    } catch (error) {
      console.error(`Failed to start LSP server for ${language}:`, error);
      this.servers.delete(language);
      return null;
    }
  }

  public async stopServer(language: string): Promise<void> {
    const server = this.servers.get(language);
    if (server) {
      await server.stop();
      this.servers.delete(language);
    }
  }

  public getServers(): string[] {
    return Array.from(this.servers.keys());
  }

  public getServer(language: string): LSPServer | undefined {
    return this.servers.get(language);
  }

  public async shutdown(): Promise<void> {
    const stopPromises = Array.from(this.servers.keys()).map(lang => this.stopServer(lang));
    await Promise.all(stopPromises);
  }
}
