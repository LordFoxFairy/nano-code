// LSP Types based on VSCode Language Server Protocol
// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/

export interface LSPServerConfig {
  command: string;
  args: string[];
  languages: string[];
  rootUri: string;
  initializationOptions?: Record<string, any>;
}

export interface LSPPosition {
  /**
   * Line position in a document (zero-based).
   */
  line: number;
  /**
   * Character offset on a line in a document (zero-based).
   */
  character: number;
}

export interface LSPRange {
  /**
   * The range's start position.
   */
  start: LSPPosition;
  /**
   * The range's end position.
   */
  end: LSPPosition;
}

export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

export namespace DiagnosticSeverity {
  export const Error = 1;
  export const Warning = 2;
  export const Information = 3;
  export const Hint = 4;
}

export type DiagnosticSeverity = 1 | 2 | 3 | 4;

export interface LSPDiagnostic {
  range: LSPRange;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: {
    location: LSPLocation;
    message: string;
  }[];
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface LSPCompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  sortText?: string;
  filterText?: string;
  insertText?: string;
  textEdit?: {
    range: LSPRange;
    newText: string;
  };
}

export interface LSPHover {
  contents: string | { language: string; value: string } | (string | { language: string; value: string })[];
  range?: LSPRange;
}

export type LSPDefinition = LSPLocation | LSPLocation[];

export type LSPReference = LSPLocation[];

export interface LSPInitializeParams {
  processId: number | null;
  clientInfo?: {
    name: string;
    version?: string;
  };
  rootUri: string | null;
  capabilities: any;
  trace?: 'off' | 'messages' | 'verbose';
  workspaceFolders?: {
    uri: string;
    name: string;
  }[] | null;
}

export interface LSPInitializeResult {
  capabilities: {
    textDocumentSync?: number | {
      openClose?: boolean;
      change?: number;
    };
    completionProvider?: {
      resolveProvider?: boolean;
      triggerCharacters?: string[];
    };
    hoverProvider?: boolean;
    definitionProvider?: boolean;
    referencesProvider?: boolean;
    documentSymbolProvider?: boolean;
    workspaceSymbolProvider?: boolean;
    [key: string]: any;
  };
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: number | string;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCNotification | JSONRPCResponse;
