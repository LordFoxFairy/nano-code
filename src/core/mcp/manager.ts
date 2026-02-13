import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPServerConfig, MCPConfig } from "./types.js";
import consola from "consola";

/**
 * Manages MCP (Model Context Protocol) server connections and tools
 */
export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();
  private tools: Map<string, StructuredTool[]> = new Map();

  /**
   * Load MCP servers from a configuration object or file
   */
  async loadFromConfig(configPath?: string): Promise<void> {
    let config: MCPConfig;

    if (configPath) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        // Handle both formats: { mcpServers: {...} } and direct {...}
        config = parsed.mcpServers ? parsed : { mcpServers: parsed };
      } catch (error) {
        consola.error(`Failed to load MCP config from ${configPath}:`, error);
        return;
      }
    } else {
      // Look for default config locations
      const defaultPath = path.resolve(process.cwd(), '.mcp.json'); // Adjusted to look in CWD
      try {
        const content = await fs.readFile(defaultPath, 'utf-8');
        const parsed = JSON.parse(content);
        config = parsed.mcpServers ? parsed : { mcpServers: parsed };
      } catch {
        // No config found, ignoring
        return;
      }
    }

    if (!config || !config.mcpServers) {
      return;
    }

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        await this.connect(name, serverConfig);
      } catch (error) {
        consola.error(`Failed to connect to MCP server ${name}:`, error);
      }
    }
  }

  /**
   * Connect to an MCP server
   */
  async connect(name: string, config: MCPServerConfig): Promise<void> {
    if (this.clients.has(name)) {
      await this.disconnect(name);
    }

    let transport: StdioClientTransport | SSEClientTransport;

    if (config.command) {
      // Stdio transport
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...(process.env as Record<string, string>), ...config.env }
      });
    } else if (config.url) {
      // SSE transport
      const url = new URL(config.url);

      // Using EventSourceInit compatible format
      const eventSourceInit = {
        withCredentials: false
      } as EventSourceInit;

      // If we have headers, we can't easily add them to standard EventSourceInit
      // but some polyfills or custom EventSource implementations support it.
      // We will keep it simple for now and just pass url.

      transport = new SSEClientTransport(url, {
        eventSourceInit
      });
    } else {
      throw new Error(`Invalid MCP server config for ${name}: missing command or url`);
    }

    const client = new Client(
      {
        name: "nanocode-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          // prompts: {},
          resources: {},
          tools: {},
        },
      }
    );

    await client.connect(transport);

    this.clients.set(name, client);
    this.transports.set(name, transport);

    // List tools and convert to LangChain format
    const { tools: mcpTools } = await client.listTools();

    // Convert tools to LangChain StructuredTool format
    const langchainTools = mcpTools.map(tool => {
      // Create a dynamic Zod schema from the tool's input schema
      const schema = this.jsonSchemaToZod(tool.inputSchema);

      return new (class extends StructuredTool {
        name = `${name}__${tool.name}`; // Namespaced to avoid conflicts
        description = tool.description || "";
        schema = schema;

        async _call(arg: any): Promise<string> {
          try {
            const result = await client.callTool({
              name: tool.name,
              arguments: arg,
            });

            // Format result
            if (result.isError) {
                throw new Error(JSON.stringify(result));
            }

            // Type assertion since SDK types might be generic
            const content = (result.content as any[]);

            if (!content || !Array.isArray(content)) {
                return JSON.stringify(result);
            }

            return content
              .map(c => {
                if (c.type === 'text') return c.text;
                if (c.type === 'image') return `[Image: ${c.mimeType}]`;
                return JSON.stringify(c);
              })
              .join('\n');
          } catch (error: any) {
            return `Error calling tool ${tool.name}: ${error.message}`;
          }
        }
      })();
    });

    this.tools.set(name, langchainTools);
    consola.success(`Connected to MCP server: ${name} (${langchainTools.length} tools)`);
  }

  /**
   * Helper to convert JSON Schema to Zod schema
   * Note: This is a simplified conversion. For complex schemas,
   * a proper library like json-schema-to-zod might be needed.
   */
  private jsonSchemaToZod(jsonSchema: any): z.ZodType<any> {
    if (!jsonSchema || !jsonSchema.properties) {
      return z.object({});
    }

    // This is a placeholder. In a real implementation, we would need
    // robust JSON Schema to Zod conversion.
    // For now, we'll accept any object that matches strict validation
    // at runtime during tool execution/parsing by LangChain.
    // Ideally use `z.object({}).passthrough()` or map properties manually.

    // Very basic mapping for demonstration
    const shape: Record<string, any> = {};
    for (const [key, prop] of Object.entries<any>(jsonSchema.properties)) {
        if (prop.type === 'string') shape[key] = z.string().describe(prop.description || "");
        else if (prop.type === 'number') shape[key] = z.number().describe(prop.description || "");
        else if (prop.type === 'boolean') shape[key] = z.boolean().describe(prop.description || "");
        else shape[key] = z.any().describe(prop.description || "");

        if (jsonSchema.required?.includes(key) === false) {
             shape[key] = shape[key].optional();
        }
    }

    return z.object(shape);
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(name: string): Promise<void> {
    const transport = this.transports.get(name);
    if (transport) {
      await transport.close();
      this.transports.delete(name);
    }

    this.clients.delete(name);
    this.tools.delete(name);
    consola.info(`Disconnected from MCP server: ${name}`);
  }

  /**
   * Disconnect from all servers
   */
  async cleanup(): Promise<void> {
    for (const name of this.clients.keys()) {
      await this.disconnect(name);
    }
  }

  /**
   * Get all loaded tools from all servers
   */
  getTools(): StructuredTool[] {
    const allTools: StructuredTool[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * List connected servers
   */
  listServers(): string[] {
    return Array.from(this.clients.keys());
  }
}
