export interface MCPServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  type?: 'stdio' | 'sse' | 'http' | 'ws';
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: any;
}
