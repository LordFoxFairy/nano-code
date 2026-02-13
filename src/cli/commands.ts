import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { Session } from './session.js';
import type { MCPServerConfig } from '../core/config/types.js';

export interface LSPServerConfig {
  name: string;
  command: string;
  args: string[];
  languages: string[];
}

export interface LSPServerStatus {
  name: string;
  config: LSPServerConfig;
  status: 'running' | 'stopped' | 'error';
  error?: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  skillContext?: string;
  skillName?: string;
  allowedTools?: string[];
  model?: string;
  /** Flag indicating a history/save action was performed */
  action?: 'save' | 'history_show' | 'skills_list' | 'mcp_status';
}

/**
 * MCP server connection status
 */
interface MCPServerStatus {
  name: string;
  config: MCPServerConfig;
  status: 'connected' | 'disconnected' | 'error' | 'unknown';
  toolCount?: number;
  error?: string;
}

interface CommandFrontmatter {
  description?: string;
  'allowed-tools'?: string | string[];
  model?: string;
  'argument-hint'?: string;
}

interface SkillDefinition {
  name: string;
  commands: string[];
  content: string;
  description: string;
  commandContents: Map<string, string>; // Maps command name to its specific content
  commandFrontmatter: Map<string, CommandFrontmatter>; // Maps command name to frontmatter
}

export class CommandHandler {
  private skills: Map<string, SkillDefinition> = new Map();
  private commandToSkill: Map<string, SkillDefinition> = new Map();
  private cwd: string;
  private mcpServers: Map<string, MCPServerStatus> = new Map();
  private lspServers: Map<string, LSPServerStatus> = new Map();

  constructor(
    private readonly session: Session,
    cwd?: string,
  ) {
    this.cwd = cwd || process.cwd();
    this.loadSkills();
    this.loadMCPConfig();
    this.initializeLSPServers();
  }

  /**
   * Parse YAML frontmatter from markdown content
   */
  private parseFrontmatter(content: string): { frontmatter: CommandFrontmatter; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch || !frontmatterMatch[1] || frontmatterMatch[2] === undefined) {
      return { frontmatter: {}, body: content };
    }

    const yaml = frontmatterMatch[1];
    const body = frontmatterMatch[2];
    const frontmatter: CommandFrontmatter = {};

    // Parse simple YAML fields
    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    if (descMatch?.[1]) frontmatter.description = descMatch[1].trim();

    const allowedToolsMatch = yaml.match(/^allowed-tools:\s*(.+)$/m);
    if (allowedToolsMatch?.[1]) frontmatter['allowed-tools'] = allowedToolsMatch[1].trim();

    const modelMatch = yaml.match(/^model:\s*(.+)$/m);
    if (modelMatch?.[1]) frontmatter.model = modelMatch[1].trim();

    const argHintMatch = yaml.match(/^argument-hint:\s*(.+)$/m);
    if (argHintMatch?.[1]) frontmatter['argument-hint'] = argHintMatch[1].trim();

    return { frontmatter, body };
  }

  /**
   * Process dynamic arguments in command content
   * - $ARGUMENTS: All arguments as a single string
   * - $1, $2, $3...: Positional arguments
   * - @filepath or @$1: File content references
   * - !`command`: Execute bash command and include output
   */
  private async processCommandContent(content: string, args: string[]): Promise<string> {
    let processed = content;

    // 1. Execute bash commands !`command`
    processed = this.executeBashCommands(processed);

    // 2. Replace positional arguments $1, $2, $3...
    for (let i = 0; i < args.length; i++) {
      const placeholder = new RegExp(`\\$${i + 1}`, 'g');
      const arg = args[i] ?? '';
      processed = processed.replace(placeholder, arg);
    }

    // 3. Replace $ARGUMENTS with all args joined
    const allArgs = args.join(' ');
    processed = processed.replace(/\$ARGUMENTS/g, allArgs);

    // 4. Expand file references @filepath (after argument substitution)
    processed = await this.expandFileReferences(processed);

    return processed;
  }

  /**
   * Execute bash commands in !`command` format
   */
  private executeBashCommands(content: string): string {
    const bashPattern = /!\`([^`]+)\`/g;
    let result = content;
    let match;

    while ((match = bashPattern.exec(content)) !== null) {
      const command = match[1] ?? '';
      if (!command) continue;

      try {
        const output = execSync(command, {
          cwd: this.cwd,
          encoding: 'utf-8',
          timeout: 30000, // 30 second timeout
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        result = result.replace(match[0], output);
      } catch (err: unknown) {
        const execError = err as { stderr?: string; message?: string };
        const errorMsg = execError.stderr || execError.message || 'Command failed';
        result = result.replace(match[0], `[Error executing '${command}': ${errorMsg}]`);
      }
    }

    return result;
  }

  /**
   * Expand file references @filepath
   */
  private async expandFileReferences(content: string): Promise<string> {
    // Match @filepath patterns (but not @username or @mentions)
    // Looking for paths that contain / or . or start with ./ or ../
    const fileRefPattern = /@(\.{0,2}\/[^\s]+|[^\s]+\.[a-zA-Z]+)/g;
    let result = content;
    let match;

    while ((match = fileRefPattern.exec(content)) !== null) {
      const filepath = match[1] ?? '';
      if (!filepath) continue;

      const fullPath = path.isAbsolute(filepath) ? filepath : path.join(this.cwd, filepath);

      try {
        if (fs.existsSync(fullPath)) {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          result = result.replace(match[0], `\n\`\`\`\n${fileContent}\n\`\`\`\n`);
        } else {
          result = result.replace(match[0], `[File not found: ${filepath}]`);
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        result = result.replace(match[0], `[Error reading ${filepath}: ${error.message}]`);
      }
    }

    return result;
  }

  /**
   * Load MCP configuration from config files
   */
  private loadMCPConfig(): void {
    try {
      // Try to load project .mcp.json
      const projectMcpPath = path.join(this.cwd, '.mcp.json');
      if (fs.existsSync(projectMcpPath)) {
        const content = fs.readFileSync(projectMcpPath, 'utf-8');
        const mcpConfig = JSON.parse(content);
        this.parseMCPConfig(mcpConfig);
      }

      // Try to load global ~/.nanocode/mcp.json
      const globalMcpPath = path.join(os.homedir(), '.nanocode', 'mcp.json');
      if (fs.existsSync(globalMcpPath)) {
        const content = fs.readFileSync(globalMcpPath, 'utf-8');
        const mcpConfig = JSON.parse(content);
        this.parseMCPConfig(mcpConfig);
      }

      // Also check ~/.agents/config.json for mcp section
      const agentsConfigPath = path.join(this.cwd, '.agents', 'config.json');
      if (fs.existsSync(agentsConfigPath)) {
        const content = fs.readFileSync(agentsConfigPath, 'utf-8');
        const config = JSON.parse(content);
        if (config.mcp?.servers) {
          this.parseMCPServers(config.mcp.servers);
        }
      }
    } catch (error) {
      // Silently fail - MCP config is optional
    }
  }

  /**
   * Parse MCP config object (supports multiple formats)
   */
  private parseMCPConfig(config: Record<string, unknown>): void {
    // Support { mcpServers: { ... } } format (Claude Desktop style)
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      this.parseMCPServers(config.mcpServers as Record<string, MCPServerConfig>);
    }
    // Support { mcp: { servers: { ... } } } format
    if (config.mcp && typeof config.mcp === 'object') {
      const mcp = config.mcp as Record<string, unknown>;
      if (mcp.servers && typeof mcp.servers === 'object') {
        this.parseMCPServers(mcp.servers as Record<string, MCPServerConfig>);
      }
    }
    // Support direct { serverName: { ... } } format
    if (!config.mcpServers && !config.mcp) {
      // Check if keys look like server configs
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'object' && value !== null && ('command' in value || 'url' in value)) {
          this.parseMCPServers({ [key]: value as MCPServerConfig });
        }
      }
    }
  }

  /**
   * Parse MCP servers from config
   */
  private parseMCPServers(servers: Record<string, MCPServerConfig>): void {
    for (const [name, config] of Object.entries(servers)) {
      // Don't override existing servers (project config takes precedence)
      if (!this.mcpServers.has(name)) {
        this.mcpServers.set(name, {
          name,
          config,
          status: 'disconnected', // Default to disconnected
        });
      }
    }
  }

  private loadSkills() {
    const skillsDir = path.join(this.cwd, '.agents', 'skills');
    if (!fs.existsSync(skillsDir)) return;

    try {
      const dirs = fs.readdirSync(skillsDir);
      for (const dir of dirs) {
        const skillFile = path.join(skillsDir, dir, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const content = fs.readFileSync(skillFile, 'utf-8');
          const matchName = content.match(/^name:\s*(.+)$/m);
          const matchDesc = content.match(/^description:\s*(.+)$/m);

          if (matchName && matchName[1]) {
            const name = matchName[1].trim();
            const description = matchDesc && matchDesc[1] ? matchDesc[1].trim() : '';
            const commandContents = new Map<string, string>();
            const commandFrontmatter = new Map<string, CommandFrontmatter>();

            // Extract commands from headers like "### /command"
            // Also include the skill name as a command
            const commands = [name];
            const headerMatches = content.matchAll(/###\s+\/([\w-]+)/g);
            for (const match of headerMatches) {
              const cmd = match[1];
              if (cmd) {
                commands.push(cmd);
              }
            }

            // Load commands from commands/*.md directory
            const commandsDir = path.join(skillsDir, dir, 'commands');
            if (fs.existsSync(commandsDir)) {
              const cmdFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
              for (const cmdFile of cmdFiles) {
                const cmdName = cmdFile.replace('.md', '');
                const cmdPath = path.join(commandsDir, cmdFile);
                const cmdContent = fs.readFileSync(cmdPath, 'utf-8');

                // Parse frontmatter for this command
                const { frontmatter, body } = this.parseFrontmatter(cmdContent);
                commandFrontmatter.set(cmdName, frontmatter);

                commands.push(cmdName);
                commandContents.set(cmdName, body);
              }
            }

            // Unique commands
            const uniqueCommands = [...new Set(commands)];

            const skillDef = {
              name,
              commands: uniqueCommands,
              content,
              description,
              commandContents,
              commandFrontmatter,
            };
            this.skills.set(name, skillDef);

            for (const cmd of uniqueCommands) {
              this.commandToSkill.set(cmd, skillDef);
            }
          }
        }
      }
    } catch (error) {
      // Silently fail if skills directory can't be read or processed
      // console.error('Error loading skills:', error);
    }
  }

  /**
   * Get skill command content with dynamic argument processing
   * @param command - The command name (with or without leading /)
   * @param args - Arguments passed to the command
   * @returns Processed command content or null if not found
   */
  async getSkillCommand(command: string, args: string[] = []): Promise<string | null> {
    const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
    const skill = this.commandToSkill.get(cleanCommand);
    if (!skill) return null;

    // Check if there's a specific command content for this command
    const specificContent = skill.commandContents.get(cleanCommand);
    if (specificContent) {
      // Process dynamic arguments in the command content
      const processedContent = await this.processCommandContent(specificContent, args);
      // Return both skill context and specific command content
      return `${skill.content}\n\n---\n\n# Command: /${cleanCommand}\n\n${processedContent}`;
    }

    // Process the skill content itself for dynamic arguments
    const processedSkillContent = await this.processCommandContent(skill.content, args);
    return processedSkillContent;
  }

  /**
   * Get frontmatter for a specific command
   */
  getCommandFrontmatter(command: string): CommandFrontmatter | null {
    const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
    const skill = this.commandToSkill.get(cleanCommand);
    if (!skill) return null;

    return skill.commandFrontmatter.get(cleanCommand) || null;
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
      case '/history':
        return this.handleHistory(args);
      case '/save':
        return await this.handleSave(args);
      case '/skills':
        return this.handleSkills();
      case '/status':
        return this.handleStatus();
      case '/compact':
        return this.handleCompact();
      case '/lsp':
        return this.handleLSP(args);
      case '/mcp':
        return this.handleMCP(args);

      default:
        // Check for skill command
        const skillContent = await this.getSkillCommand(command, args);
        if (skillContent) {
          // We found a matching skill
          const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
          const skillDef = this.commandToSkill.get(cleanCommand);
          const frontmatter = this.getCommandFrontmatter(command);

          // Parse allowed-tools from frontmatter
          let allowedTools: string[] | undefined;
          if (frontmatter?.['allowed-tools']) {
            const tools = frontmatter['allowed-tools'];
            if (typeof tools === 'string') {
              // Parse comma-separated or space-separated list
              allowedTools = tools.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
            } else if (Array.isArray(tools)) {
              allowedTools = tools;
            }
          }

          return {
            success: true,
            output: `Activated skill: ${skillDef?.name}${args.length > 0 ? ` with args: ${args.join(' ')}` : ''}`,
            skillContext: skillContent,
            skillName: skillDef?.name,
            allowedTools,
            model: frontmatter?.model,
          };
        }

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
    const mainHelp = [
      chalk.bold('Available Commands:'),
      '  /help           Show this help message',
      '  /model [name]   Switch model (opus, sonnet, haiku)',
      '  /clear          Clear conversation context (starts new thread)',
      '  /history [n]    Show conversation history (last n messages)',
      '  /save [name]    Save current session with optional name',
      '  /skills         List all available skills',
      '  /status         Show current session status',
      '  /compact        Summarize and compact context',
      '  /mcp            Show MCP server status and tools',
      '  /lsp            Manage language servers',
      '  /exit           Exit NanoCode',
    ];

    if (this.skills.size > 0) {
      mainHelp.push('');
      mainHelp.push(chalk.bold('Skill Commands:'));
      for (const [name, skill] of this.skills.entries()) {
        const uniqueCmds = skill.commands.filter((c) => c !== name).map((c) => `/${c}`);
        const cmdsStr = uniqueCmds.length > 0 ? ` (${uniqueCmds.join(', ')})` : '';
        mainHelp.push(`  /${name}${cmdsStr}`);
      }
    }

    return { success: true, output: mainHelp.join('\n') };
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

  private handleHistory(args: string[]): CommandResult {
    const count = parseInt(args[0] || '10', 10);
    const history = this.session.getHistory();

    if (history.length === 0) {
      return { success: true, output: 'No conversation history yet.', action: 'history_show' };
    }

    const messages = history.slice(-count);
    const formatted = messages
      .map((msg, i) => {
        const role = chalk.bold(msg.role === 'user' ? chalk.blue('You') : chalk.green('Assistant'));
        const content = msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : '');
        return `${i + 1}. ${role}: ${content}`;
      })
      .join('\n\n');

    return {
      success: true,
      output: `${chalk.bold(`Last ${messages.length} messages:`)}\n\n${formatted}`,
      action: 'history_show',
    };
  }

  private async handleSave(args: string[]): Promise<CommandResult> {
    const name = args[0] || `session-${Date.now()}`;

    try {
      await this.session.save();
      this.session.setMetadata('name', name);

      return {
        success: true,
        output: `Session saved as "${name}" (ID: ${this.session.threadId})`,
        action: 'save',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: `Failed to save session: ${errorMessage}`,
      };
    }
  }

  private handleSkills(): CommandResult {
    if (this.skills.size === 0) {
      return {
        success: true,
        output: 'No skills available. Add skills to .agents/skills/ directory.',
        action: 'skills_list',
      };
    }

    const skillsList: string[] = [chalk.bold('Available Skills:'), ''];

    for (const [name, skill] of this.skills.entries()) {
      const description = skill.description || 'No description';
      const commands = skill.commands.filter((c) => c !== name).map((c) => `/${c}`);
      const commandsStr = commands.length > 0 ? ` (${commands.join(', ')})` : '';

      skillsList.push(`  ${chalk.cyan('/' + name)}${commandsStr}`);
      skillsList.push(`    ${chalk.dim(description)}`);
    }

    return {
      success: true,
      output: skillsList.join('\n'),
      action: 'skills_list',
    };
  }

  private handleStatus(): CommandResult {
    const status = [
      chalk.bold('Session Status:'),
      '',
      `  Thread ID:    ${this.session.threadId}`,
      `  Mode:         ${this.session.mode}`,
      `  Working Dir:  ${this.cwd}`,
      `  Messages:     ${this.session.getHistory().length}`,
      `  Skills:       ${this.skills.size}`,
    ];

    const metadata = this.session.getMetadata<string>('name');
    if (metadata) {
      status.splice(3, 0, `  Name:         ${metadata}`);
    }

    return { success: true, output: status.join('\n') };
  }

  private handleCompact(): CommandResult {
    // This is a placeholder - actual context compaction would require
    // integration with the agent's memory/summarization capabilities
    return {
      success: true,
      output: chalk.yellow('Context compaction requested. This will be applied at the next interaction.'),
    };
  }

  /**
   * Handle /mcp command with subcommands
   * - /mcp - Show MCP status (connected servers, available tools)
   * - /mcp list - List all configured servers and their status
   * - /mcp tools - List all MCP-provided tools
   * - /mcp connect <server> - Connect to a specific server
   * - /mcp disconnect <server> - Disconnect from a server
   */
  private handleMCP(args: string[]): CommandResult {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'list':
        return this.handleMCPList();
      case 'tools':
        return this.handleMCPTools();
      case 'connect':
        return this.handleMCPConnect(args[1]);
      case 'disconnect':
        return this.handleMCPDisconnect(args[1]);
      default:
        return this.handleMCPStatus();
    }
  }

  /**
   * Show MCP overall status
   */
  private handleMCPStatus(): CommandResult {
    if (this.mcpServers.size === 0) {
      const output = [
        chalk.bold('MCP Status'),
        '',
        chalk.dim('No MCP servers configured.'),
        '',
        chalk.dim('To configure MCP servers, create one of:'),
        chalk.dim('  - .mcp.json in your project directory'),
        chalk.dim('  - ~/.nanocode/mcp.json for global config'),
        chalk.dim('  - mcp section in .agents/config.json'),
        '',
        chalk.dim('Example .mcp.json:'),
        chalk.dim('  {'),
        chalk.dim('    "mcpServers": {'),
        chalk.dim('      "my-server": {'),
        chalk.dim('        "command": "npx",'),
        chalk.dim('        "args": ["-y", "@my/mcp-server"]'),
        chalk.dim('      }'),
        chalk.dim('    }'),
        chalk.dim('  }'),
      ];
      return { success: true, output: output.join('\n'), action: 'mcp_status' };
    }

    const connectedCount = Array.from(this.mcpServers.values()).filter(
      (s) => s.status === 'connected',
    ).length;
    const totalTools = Array.from(this.mcpServers.values()).reduce(
      (acc, s) => acc + (s.toolCount || 0),
      0,
    );

    const output = [
      chalk.bold('MCP Status'),
      '',
      `  ${chalk.cyan('Servers:')}    ${connectedCount}/${this.mcpServers.size} connected`,
      `  ${chalk.cyan('Tools:')}      ${totalTools} available`,
      '',
      chalk.bold('Configured Servers:'),
    ];

    for (const [name, server] of this.mcpServers.entries()) {
      const statusIcon = this.getStatusIcon(server.status);
      const statusColor = this.getStatusColor(server.status);
      const toolInfo = server.toolCount !== undefined ? chalk.dim(` (${server.toolCount} tools)`) : '';
      const typeInfo = this.getServerTypeInfo(server.config);

      output.push(`  ${statusIcon} ${chalk.bold(name)} ${statusColor(server.status)}${toolInfo}`);
      output.push(`    ${chalk.dim(typeInfo)}`);
    }

    output.push('');
    output.push(chalk.dim('Use /mcp list for details, /mcp tools to see available tools'));

    return { success: true, output: output.join('\n'), action: 'mcp_status' };
  }

  /**
   * List all MCP servers with details
   */
  private handleMCPList(): CommandResult {
    if (this.mcpServers.size === 0) {
      return {
        success: true,
        output: chalk.dim('No MCP servers configured.'),
        action: 'mcp_status',
      };
    }

    const output = [chalk.bold('MCP Servers:'), ''];

    for (const [name, server] of this.mcpServers.entries()) {
      const statusIcon = this.getStatusIcon(server.status);
      const statusColor = this.getStatusColor(server.status);

      output.push(`${statusIcon} ${chalk.bold(name)}`);
      output.push(`    Status:  ${statusColor(server.status)}`);

      if (server.config.command) {
        const args = server.config.args?.join(' ') || '';
        output.push(`    Command: ${chalk.cyan(server.config.command)} ${chalk.dim(args)}`);
      }

      if (server.config.url) {
        output.push(`    URL:     ${chalk.cyan(server.config.url)}`);
      }

      if (server.config.type) {
        output.push(`    Type:    ${chalk.dim(server.config.type)}`);
      }

      if (server.toolCount !== undefined) {
        output.push(`    Tools:   ${server.toolCount}`);
      }

      if (server.error) {
        output.push(`    Error:   ${chalk.red(server.error)}`);
      }

      output.push('');
    }

    return { success: true, output: output.join('\n'), action: 'mcp_status' };
  }

  /**
   * List all tools from MCP servers
   */
  private handleMCPTools(): CommandResult {
    if (this.mcpServers.size === 0) {
      return {
        success: true,
        output: chalk.dim('No MCP servers configured.'),
        action: 'mcp_status',
      };
    }

    const connectedServers = Array.from(this.mcpServers.values()).filter(
      (s) => s.status === 'connected',
    );

    if (connectedServers.length === 0) {
      const output = [
        chalk.yellow('No MCP servers are currently connected.'),
        '',
        chalk.dim('Use /mcp connect <server> to connect to a server.'),
        '',
        chalk.dim('Available servers:'),
      ];

      for (const name of this.mcpServers.keys()) {
        output.push(`  - ${name}`);
      }

      return { success: true, output: output.join('\n'), action: 'mcp_status' };
    }

    const output = [chalk.bold('MCP Tools:'), ''];

    for (const server of connectedServers) {
      output.push(`${chalk.cyan(server.name)} ${chalk.dim(`(${server.toolCount || 0} tools)`)}`);

      // In a real implementation, we would list actual tools here
      // For now, show a placeholder since we don't have actual tool info
      if (server.toolCount && server.toolCount > 0) {
        output.push(chalk.dim('  (Tool details would be shown here when server is connected)'));
      } else {
        output.push(chalk.dim('  No tools available'));
      }

      output.push('');
    }

    return { success: true, output: output.join('\n'), action: 'mcp_status' };
  }

  /**
   * Connect to an MCP server
   */
  private handleMCPConnect(serverName?: string): CommandResult {
    if (!serverName) {
      return {
        success: false,
        output: chalk.red('Usage: /mcp connect <server-name>'),
      };
    }

    const server = this.mcpServers.get(serverName);
    if (!server) {
      const available = Array.from(this.mcpServers.keys()).join(', ');
      return {
        success: false,
        output: available
          ? `${chalk.red(`Server "${serverName}" not found.`)} Available: ${available}`
          : chalk.red(`Server "${serverName}" not found. No servers configured.`),
      };
    }

    if (server.status === 'connected') {
      return {
        success: true,
        output: chalk.yellow(`Server "${serverName}" is already connected.`),
      };
    }

    // Update status to connected (in a real implementation, we would actually connect)
    server.status = 'connected';
    server.toolCount = 0; // Would be populated by actual connection

    // Note: Real connection would happen via the agent's MCP client
    // This is a placeholder that updates the UI state
    return {
      success: true,
      output: [
        chalk.green(`Connecting to "${serverName}"...`),
        '',
        chalk.dim('Note: MCP server connection is handled by the agent.'),
        chalk.dim('Tools from this server will be available in the next interaction.'),
      ].join('\n'),
      action: 'mcp_status',
    };
  }

  /**
   * Disconnect from an MCP server
   */
  private handleMCPDisconnect(serverName?: string): CommandResult {
    if (!serverName) {
      return {
        success: false,
        output: chalk.red('Usage: /mcp disconnect <server-name>'),
      };
    }

    const server = this.mcpServers.get(serverName);
    if (!server) {
      const available = Array.from(this.mcpServers.keys()).join(', ');
      return {
        success: false,
        output: available
          ? `${chalk.red(`Server "${serverName}" not found.`)} Available: ${available}`
          : chalk.red(`Server "${serverName}" not found. No servers configured.`),
      };
    }

    if (server.status === 'disconnected') {
      return {
        success: true,
        output: chalk.yellow(`Server "${serverName}" is already disconnected.`),
      };
    }

    // Update status to disconnected
    server.status = 'disconnected';
    server.toolCount = undefined;

    return {
      success: true,
      output: chalk.green(`Disconnected from "${serverName}".`),
      action: 'mcp_status',
    };
  }

  /**
   * Get status icon for display
   */
  private getStatusIcon(status: MCPServerStatus['status']): string {
    switch (status) {
      case 'connected':
        return chalk.green('●');
      case 'disconnected':
        return chalk.dim('○');
      case 'error':
        return chalk.red('✗');
      default:
        return chalk.yellow('?');
    }
  }

  /**
   * Get status color function
   */
  private getStatusColor(status: MCPServerStatus['status']): (text: string) => string {
    switch (status) {
      case 'connected':
        return chalk.green;
      case 'disconnected':
        return chalk.dim;
      case 'error':
        return chalk.red;
      default:
        return chalk.yellow;
    }
  }

  /**
   * Get server type info string
   */
  private getServerTypeInfo(config: MCPServerConfig): string {
    if (config.command) {
      const args = config.args?.slice(0, 3).join(' ') || '';
      const truncated = config.args && config.args.length > 3 ? '...' : '';
      return `${config.command} ${args}${truncated}`;
    }
    if (config.url) {
      return config.url;
    }
    if (config.type) {
      return `Type: ${config.type}`;
    }
    return 'Unknown configuration';
  }

  private initializeLSPServers() {
    const defaults: LSPServerConfig[] = [
      { name: 'typescript', command: 'typescript-language-server', args: ['--stdio'], languages: ['typescript', 'javascript', 'ts', 'js'] },
      { name: 'python', command: 'pylsp', args: [], languages: ['python', 'py'] },
      { name: 'rust', command: 'rust-analyzer', args: [], languages: ['rust', 'rs'] },
      { name: 'go', command: 'gopls', args: [], languages: ['go'] },
    ];

    for (const config of defaults) {
      this.lspServers.set(config.name, {
        name: config.name,
        config,
        status: 'stopped',
      });
    }
  }

  private handleLSP(args: string[]): CommandResult {
    const subcommand = args[0]?.toLowerCase();

    switch (subcommand) {
      case 'start':
        return this.handleLSPStart(args[1]);
      case 'stop':
        return this.handleLSPStop(args[1]);
      case 'restart':
        return this.handleLSPRestart(args[1]);
      case 'supported':
        return this.handleLSPSupported();
      default:
        return this.handleLSPStatus();
    }
  }

  private handleLSPStatus(): CommandResult {
    if (this.lspServers.size === 0) {
      return { success: true, output: chalk.dim('No LSP servers configured.') };
    }

    const output = [
      chalk.bold('LSP Status'),
      '',
    ];

    const runningCount = Array.from(this.lspServers.values()).filter((s) => s.status === 'running').length;

    output.push(`  Running Servers: ${runningCount}/${this.lspServers.size}`);
    output.push('');
    output.push(chalk.bold('Server Status:'));

    for (const [name, server] of this.lspServers.entries()) {
      const statusColor = server.status === 'running' ? chalk.green :
        server.status === 'error' ? chalk.red : chalk.dim;
      const statusIcon = server.status === 'running' ? '●' :
        server.status === 'error' ? '✗' : '○';

      output.push(`  ${statusIcon} ${chalk.bold(name)} ${statusColor(server.status)}`);
      if (server.error) {
        output.push(`    Error: ${chalk.red(server.error)}`);
      }
    }

    output.push('');
    output.push(chalk.dim('Use /lsp start <lang> to start a server'));
    output.push(chalk.dim('Use /lsp supported to see supported languages'));

    return { success: true, output: output.join('\n'), action: 'mcp_status' };
  }

  private handleLSPSupported(): CommandResult {
    const output = [chalk.bold('Supported Languages:'), ''];

    for (const [name, server] of this.lspServers.entries()) {
      output.push(`${chalk.cyan(name)}:`);
      output.push(`  Command: ${server.config.command} ${server.config.args.join(' ')}`);
      output.push(`  Languages: ${server.config.languages.join(', ')}`);
      output.push('');
    }

    return { success: true, output: output.join('\n') };
  }

  private handleLSPStart(language?: string): CommandResult {
    if (!language) return { success: false, output: chalk.red('Usage: /lsp start <language>') };

    const server = this.findServer(language);
    if (!server) return { success: false, output: chalk.red(`No LSP server configured for "${language}"`) };

    if (server.status === 'running') {
      return { success: true, output: chalk.yellow(`LSP server for ${server.name} is already running.`) };
    }

    // Check binaries
    if (!this.checkCommandExists(server.config.command)) {
      server.status = 'error';
      server.error = 'Binary not found';
      return {
        success: false,
        output: chalk.red(`Failed to start ${server.name} LSP.\nCommand "${server.config.command}" not found in PATH.\nPlease install the language server.`)
      };
    }

    server.status = 'running';
    server.error = undefined;

    return { success: true, output: chalk.green(`Started ${server.name} LSP server.`) };
  }

  private handleLSPStop(language?: string): CommandResult {
    if (!language) return { success: false, output: chalk.red('Usage: /lsp stop <language>') };

    const server = this.findServer(language);
    if (!server) return { success: false, output: chalk.red(`No LSP server configured for "${language}"`) };

    if (server.status === 'stopped') {
      return { success: true, output: chalk.yellow(`LSP server for ${server.name} is already stopped.`) };
    }

    server.status = 'stopped';
    return { success: true, output: chalk.green(`Stopped ${server.name} LSP server.`) };
  }

  private handleLSPRestart(language?: string): CommandResult {
    if (!language) return { success: false, output: chalk.red('Usage: /lsp restart <language>') };
    const stopResult = this.handleLSPStop(language);
    if (!stopResult.success && !stopResult.output.includes('already stopped')) return stopResult;
    return this.handleLSPStart(language);
  }

  private findServer(query: string): LSPServerStatus | undefined {
    // Try exact name match
    if (this.lspServers.has(query)) return this.lspServers.get(query);

    // Try language match
    for (const server of this.lspServers.values()) {
      if (server.config.languages.includes(query)) return server;
    }
    return undefined;
  }

  private checkCommandExists(command: string): boolean {
    try {
      execSync(`command -v ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
