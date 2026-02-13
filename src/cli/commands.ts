import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import type { Session } from './session.js';
import type { MCPServerConfig } from '../core/config/types.js';
import { getUsageStats } from '../middleware/agent-middleware.js';
import { getPluginManager, PluginManager } from '../plugins/manager.js';
import { handlePermissions } from '../permissions/index.js';
import { KeybindingManager } from './keybindings.js';
import { getPlanMode, PlanMode } from './plan-mode.js';

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
  action?: 'save' | 'history_show' | 'skills_list' | 'mcp_status' | 'keybindings_list' | 'plan_mode';
  /** Plan mode state change */
  planModeChange?: 'enter' | 'exit' | 'accept' | 'reject';
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
  private keybindingManager: KeybindingManager;
  private planMode: PlanMode;

  constructor(
    private readonly session: Session,
    cwd?: string,
  ) {
    this.cwd = cwd || process.cwd();
    this.keybindingManager = new KeybindingManager();
    this.planMode = getPlanMode();
    this.loadSkills();
    this.loadMCPConfig();
    this.initializeLSPServers();
  }

  /**
   * Get the plan mode instance
   */
  getPlanMode(): PlanMode {
    return this.planMode;
  }

  /**
   * Check if plan mode is active
   */
  isPlanModeActive(): boolean {
    return this.planMode.isActive;
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
      case '/resume':
        return await this.handleResume(args);
      case '/rename':
        return await this.handleRename(args);
      case '/sessions':
        return await this.handleSessions();
      case '/skills':
        return this.handleSkills();
      case '/status':
        return this.handleStatus();
      case '/compact':
        return this.handleCompact();
      case '/context':
        return this.handleContext();
      case '/lsp':
        return this.handleLSP(args);
      case '/mcp':
        return this.handleMCP(args);
      case '/plugins':
        return await this.handlePlugins(args);
      case '/permissions':
        return handlePermissions(args);
      case '/keybindings':
        return this.handleKeybindings();
      case '/plan':
        return await this.handlePlan(args);
      case '/plan:accept':
        return await this.handlePlanAccept();
      case '/plan:reject':
        return await this.handlePlanReject(args);
      case '/plan:show':
        return this.handlePlanShow();
      case '/plan:save':
        return await this.handlePlanSave(args);
      case '/plan:load':
        return await this.handlePlanLoad(args);
      case '/plan:list':
        return await this.handlePlanList();
      case '/plan:auto':
        return this.handlePlanAutoAccept(args);

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
    const planModeIndicator = this.planMode.isActive ? chalk.yellow(' [PLAN MODE ACTIVE]') : '';

    const mainHelp = [
      chalk.bold('Available Commands:') + planModeIndicator,
      '  /help           Show this help message',
      '  /model [name]   Switch model (opus, sonnet, haiku)',
      '  /clear          Clear conversation context (starts new thread)',
      '  /history [n]    Show conversation history (last n messages)',
      '  /resume [id]    Resume a previous session (by ID or name)',
      '  /rename <name>  Rename the current session',
      '  /sessions       List saved sessions',
      '  /save [name]    Save current session with optional name',
      '  /skills         List all available skills',
      '  /status         Show current session status',
      '  /compact        Summarize and compact context',
      '  /context        Show context/token usage visualization',
      '  /mcp            Show MCP server status and tools',
      '  /lsp            Manage language servers',
      '  /plugins        Manage installed plugins',
      '  /permissions    Manage tool permission rules',
      '  /keybindings    Show keyboard shortcuts',
      '  /exit           Exit NanoCode',
      '',
      chalk.bold('Plan Mode Commands:'),
      '  /plan           Enter plan mode (track changes without executing)',
      '  /plan:accept    Accept and execute all proposed changes',
      '  /plan:reject [feedback]  Reject plan with optional feedback',
      '  /plan:show      Show current proposed changes',
      '  /plan:save [name]  Save current plan to disk',
      '  /plan:load <id> Load a saved plan',
      '  /plan:list      List all saved plans',
      '  /plan:auto [on|off]  Toggle auto-accept mode',
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
   * Handle /context command - Show token usage visualization
   */
  private handleContext(): CommandResult {
    const stats = getUsageStats();
    const maxContextTokens = 200000; // Claude context window

    // Calculate context usage percentage
    const usagePercent = Math.min(100, (stats.totalTokens / maxContextTokens) * 100);
    const barWidth = 40;
    const filledWidth = Math.round((usagePercent / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;

    // Color based on usage level
    const getBarColor = (percent: number): typeof chalk => {
      if (percent < 50) return chalk.green;
      if (percent < 75) return chalk.yellow;
      if (percent < 90) return chalk.hex('#FFA500'); // Orange
      return chalk.red;
    };

    const barColor = getBarColor(usagePercent);
    const progressBar = barColor('█'.repeat(filledWidth)) + chalk.dim('░'.repeat(emptyWidth));

    // Format token numbers
    const formatTokens = (n: number): string => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return n.toString();
    };

    // Calculate time running
    const duration = stats.lastUpdateTime - stats.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Build output
    const output = [
      chalk.bold('Context Usage'),
      '',
      `  [${progressBar}] ${usagePercent.toFixed(1)}%`,
      '',
      chalk.bold('Token Breakdown:'),
      `  ${chalk.cyan('Input:')}     ${formatTokens(stats.totalInputTokens).padStart(8)} tokens`,
      `  ${chalk.cyan('Output:')}    ${formatTokens(stats.totalOutputTokens).padStart(8)} tokens`,
      `  ${chalk.cyan('Total:')}     ${formatTokens(stats.totalTokens).padStart(8)} tokens`,
      '',
    ];

    // Add cache stats if available
    if (stats.cacheReadTokens > 0 || stats.cacheWriteTokens > 0) {
      output.push(chalk.bold('Cache Stats:'));
      output.push(`  ${chalk.dim('Read:')}      ${formatTokens(stats.cacheReadTokens).padStart(8)} tokens`);
      output.push(`  ${chalk.dim('Write:')}     ${formatTokens(stats.cacheWriteTokens).padStart(8)} tokens`);
      output.push('');
    }

    output.push(chalk.bold('Session Stats:'));
    output.push(`  ${chalk.dim('Model Calls:')} ${stats.modelCalls}`);
    output.push(`  ${chalk.dim('Tool Calls:')}  ${stats.toolCalls}`);
    output.push(`  ${chalk.dim('Duration:')}    ${timeStr}`);
    output.push(`  ${chalk.dim('Est. Cost:')}   $${stats.estimatedCost.toFixed(4)}`);

    // Add warnings if context is getting full
    if (usagePercent >= 90) {
      output.push('');
      output.push(chalk.red('⚠ Context almost full! Consider using /compact to summarize.'));
    } else if (usagePercent >= 75) {
      output.push('');
      output.push(chalk.yellow('⚡ Context getting full. /compact available when needed.'));
    }

    return { success: true, output: output.join('\n') };
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

  private handleKeybindings(): CommandResult {
    const bindings = this.keybindingManager.getKeybindings();
    const output = [chalk.bold('Keyboard Shortcuts:'), ''];

    for (const binding of bindings) {
      const keys = this.keybindingManager.formatKeybinding(binding);
      output.push(`  ${chalk.cyan(keys.padEnd(15))} ${binding.description}`);
    }

    output.push('');
    output.push(chalk.dim('Note: Some shortcuts may depend on terminal support'));

    return {
      success: true,
      output: output.join('\n'),
      action: 'keybindings_list',
    };
  }

  /**
   * Handle /resume command - Resume a previous session
   */
  private async handleResume(args: string[]): Promise<CommandResult> {
    const query = args[0];

    if (!query) {
      // Show sessions list if no argument provided
      return await this.handleSessions();
    }

    // Import Session class dynamically to avoid circular dependencies
    const { Session } = await import('./session.js');
    const sessionData = await Session.find(query);

    if (!sessionData) {
      return {
        success: false,
        output: chalk.red(`Session not found matching "${query}"`),
      };
    }

    // Build info about the session found
    const name = String(sessionData.metadata?.name || '(unnamed)');
    const date = new Date(sessionData.updatedAt).toLocaleString();
    const msgs = sessionData.messages.length;

    const output = [
      chalk.bold('Found Session:'),
      '',
      `  ${chalk.cyan('ID:')}       ${sessionData.id}`,
      `  ${chalk.cyan('Name:')}     ${name}`,
      `  ${chalk.cyan('Updated:')}  ${date}`,
      `  ${chalk.cyan('Messages:')} ${msgs}`,
      `  ${chalk.cyan('Mode:')}     ${sessionData.mode}`,
      '',
      chalk.dim('To resume this session, restart NanoCode with:'),
      `  ${chalk.cyan(`minicode --resume ${sessionData.id.substring(0, 8)}`)}`,
      '',
      chalk.dim('(Dynamic session switching will be available in a future update)'),
    ];

    return {
      success: true,
      output: output.join('\n'),
    };
  }

  /**
   * Handle /rename command - Rename the current session
   */
  private async handleRename(args: string[]): Promise<CommandResult> {
    const name = args.join(' ').trim();
    if (!name) {
      return {
        success: false,
        output: chalk.red('Usage: /rename <new-name>'),
      };
    }

    this.session.setMetadata('name', name);
    // Auto-save after rename
    await this.session.save();

    return {
      success: true,
      output: chalk.green(`Session renamed to "${name}"`),
    };
  }

  /**
   * Handle /sessions command - List all saved sessions
   */
  private async handleSessions(): Promise<CommandResult> {
    // Import Session class dynamically to avoid circular dependencies
    const { Session } = await import('./session.js');
    const sessions = await Session.list();

    if (sessions.length === 0) {
      return {
        success: true,
        output: chalk.dim('No saved sessions found.\n\nUse /save to save the current session.'),
      };
    }

    const output = [chalk.bold('Saved Sessions:'), ''];

    for (const s of sessions) {
      const date = new Date(s.updatedAt).toLocaleString();
      const name = String(s.metadata?.name || '(unnamed)');
      const msgs = s.messages.length;
      const id = s.id.substring(0, 8);

      // Mark current session
      const isCurrent = s.id === this.session.id;
      const marker = isCurrent ? chalk.green('● ') : '  ';
      const currentLabel = isCurrent ? chalk.green(' (current)') : '';

      output.push(`${marker}${chalk.cyan(id)}: ${chalk.bold(name)}${currentLabel}`);
      output.push(`    ${chalk.dim(date)} • ${msgs} messages • ${s.mode}`);
    }

    output.push('');
    output.push(chalk.dim('Use /resume <id|name> to view session details'));
    output.push(chalk.dim('Use --resume <id> flag when starting to resume a session'));

    return {
      success: true,
      output: output.join('\n'),
    };
  }

  /**
   * Handle /plugins command
   */
  private async handlePlugins(args: string[]): Promise<CommandResult> {
    const subcommand = args[0]?.toLowerCase();
    const pluginManager = getPluginManager();

    if (!pluginManager) {
      return {
        success: false,
        output: chalk.red('Plugin manager not initialized.'),
      };
    }

    switch (subcommand) {
      case 'list':
      default:
        return this.handlePluginsList(pluginManager);
    }
  }

  private handlePluginsList(pluginManager: PluginManager): CommandResult {
    const plugins = pluginManager.getPlugins();

    if (plugins.length === 0) {
      return {
        success: true,
        output: chalk.dim('No plugins installed.'),
      };
    }

    const output = [chalk.bold('Installed Plugins:'), ''];

    for (const plugin of plugins) {
      const manifest = plugin.manifest;
      const statusIcon = chalk.green('●');

      output.push(`${statusIcon} ${chalk.bold(manifest.name)} v${manifest.version}`);
      if (manifest.description) {
        output.push(`    ${chalk.dim(manifest.description)}`);
      }
    }

    return { success: true, output: output.join('\n') };
  }

  // ============================================
  // Plan Mode Commands
  // ============================================

  /**
   * Handle /plan command - Enter plan mode or show status
   */
  private async handlePlan(args: string[]): Promise<CommandResult> {
    const subcommand = args[0]?.toLowerCase();

    // If no subcommand, toggle plan mode
    if (!subcommand) {
      if (this.planMode.isActive) {
        // Exit plan mode
        await this.planMode.exit();
        return {
          success: true,
          output: chalk.green('Exited plan mode. Changes were not executed.'),
          action: 'plan_mode',
          planModeChange: 'exit',
        };
      } else {
        // Enter plan mode
        await this.planMode.enter(this.session.id);
        return {
          success: true,
          output: [
            chalk.green('Entered plan mode.'),
            '',
            chalk.dim('In plan mode, changes are proposed but not executed.'),
            chalk.dim('Use /plan:show to see proposed changes.'),
            chalk.dim('Use /plan:accept to execute all changes.'),
            chalk.dim('Use /plan:reject [feedback] to reject and provide feedback.'),
          ].join('\n'),
          action: 'plan_mode',
          planModeChange: 'enter',
        };
      }
    }

    // Handle subcommands
    switch (subcommand) {
      case 'on':
      case 'enter':
        if (this.planMode.isActive) {
          return {
            success: true,
            output: chalk.yellow('Already in plan mode.'),
          };
        }
        await this.planMode.enter(this.session.id, args[1]);
        return {
          success: true,
          output: chalk.green('Entered plan mode.'),
          action: 'plan_mode',
          planModeChange: 'enter',
        };

      case 'off':
      case 'exit':
        if (!this.planMode.isActive) {
          return {
            success: true,
            output: chalk.yellow('Not in plan mode.'),
          };
        }
        await this.planMode.exit();
        return {
          success: true,
          output: chalk.green('Exited plan mode.'),
          action: 'plan_mode',
          planModeChange: 'exit',
        };

      case 'status':
        return this.handlePlanShow();

      default:
        return {
          success: false,
          output: chalk.red(`Unknown plan subcommand: ${subcommand}`),
        };
    }
  }

  /**
   * Handle /plan:accept - Accept and execute all proposed changes
   */
  private async handlePlanAccept(): Promise<CommandResult> {
    if (!this.planMode.isActive) {
      return {
        success: false,
        output: chalk.red('Not in plan mode. Use /plan to enter plan mode first.'),
      };
    }

    const summary = this.planMode.getSummary();

    if (summary.pendingCount === 0) {
      return {
        success: false,
        output: chalk.yellow('No pending changes to accept.'),
      };
    }

    // Approve all pending changes
    const approvedCount = await this.planMode.approveAll();

    // Note: Actual execution would be handled by the agent middleware
    // Here we just approve and let the caller know changes are ready

    const output = [
      chalk.green(`Approved ${approvedCount} change(s).`),
      '',
      chalk.bold('Approved Changes:'),
      this.planMode.formatChanges(this.planMode.approvedChanges),
      '',
      chalk.dim('Changes will be executed when you continue the conversation.'),
    ];

    return {
      success: true,
      output: output.join('\n'),
      action: 'plan_mode',
      planModeChange: 'accept',
    };
  }

  /**
   * Handle /plan:reject - Reject plan with optional feedback
   */
  private async handlePlanReject(args: string[]): Promise<CommandResult> {
    if (!this.planMode.isActive) {
      return {
        success: false,
        output: chalk.red('Not in plan mode. Use /plan to enter plan mode first.'),
      };
    }

    const feedback = args.join(' ').trim() || undefined;
    const summary = this.planMode.getSummary();

    if (summary.pendingCount === 0 && summary.approvedCount === 0) {
      return {
        success: false,
        output: chalk.yellow('No changes to reject.'),
      };
    }

    // Reject all pending changes
    const rejectedCount = await this.planMode.rejectAll(feedback);

    const output = [
      chalk.red(`Rejected ${rejectedCount} change(s).`),
    ];

    if (feedback) {
      output.push('');
      output.push(chalk.dim(`Feedback: ${feedback}`));
    }

    output.push('');
    output.push(chalk.dim('Feedback will be provided to the assistant.'));

    return {
      success: true,
      output: output.join('\n'),
      action: 'plan_mode',
      planModeChange: 'reject',
    };
  }

  /**
   * Handle /plan:show - Show current proposed changes
   */
  private handlePlanShow(): CommandResult {
    const summary = this.planMode.getSummary();

    if (!this.planMode.isActive && summary.totalChanges === 0) {
      return {
        success: true,
        output: [
          chalk.dim('Plan mode is not active.'),
          '',
          chalk.dim('Use /plan to enter plan mode.'),
        ].join('\n'),
      };
    }

    const statusText = this.planMode.isActive
      ? chalk.green('Active')
      : chalk.dim('Inactive');

    const autoAcceptText = summary.autoAccept
      ? chalk.green('On')
      : chalk.dim('Off');

    const output = [
      chalk.bold('Plan Status'),
      '',
      `  ${chalk.cyan('Status:')}       ${statusText}`,
      `  ${chalk.cyan('Plan ID:')}      ${summary.planId?.substring(0, 8) || 'N/A'}`,
      `  ${chalk.cyan('Plan Name:')}    ${summary.planName || 'Unnamed'}`,
      `  ${chalk.cyan('Auto-Accept:')}  ${autoAcceptText}`,
      '',
      chalk.bold('Changes Summary'),
      `  ${chalk.yellow('Pending:')}     ${summary.pendingCount}`,
      `  ${chalk.green('Approved:')}    ${summary.approvedCount}`,
      `  ${chalk.red('Rejected:')}    ${summary.rejectedCount}`,
      `  ${chalk.blue('Executed:')}    ${summary.executedCount}`,
      `  ${chalk.dim('Total:')}       ${summary.totalChanges}`,
    ];

    if (summary.totalChanges > 0) {
      output.push('');
      output.push(chalk.bold('Proposed Changes:'));
      output.push(this.planMode.formatChanges());
    }

    return {
      success: true,
      output: output.join('\n'),
      action: 'plan_mode',
    };
  }

  /**
   * Handle /plan:save - Save current plan to disk
   */
  private async handlePlanSave(args: string[]): Promise<CommandResult> {
    if (!this.planMode.isActive) {
      return {
        success: false,
        output: chalk.red('Not in plan mode. Use /plan to enter plan mode first.'),
      };
    }

    const name = args.join(' ').trim() || undefined;

    try {
      const planPath = await this.planMode.save(name);
      const summary = this.planMode.getSummary();

      return {
        success: true,
        output: [
          chalk.green(`Plan saved successfully.`),
          '',
          `  ${chalk.cyan('Name:')}    ${summary.planName}`,
          `  ${chalk.cyan('ID:')}      ${summary.planId?.substring(0, 8)}`,
          `  ${chalk.cyan('Changes:')} ${summary.totalChanges}`,
          `  ${chalk.cyan('Path:')}    ${planPath}`,
        ].join('\n'),
        action: 'plan_mode',
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: chalk.red(`Failed to save plan: ${error}`),
      };
    }
  }

  /**
   * Handle /plan:load - Load a saved plan
   */
  private async handlePlanLoad(args: string[]): Promise<CommandResult> {
    const planId = args[0];

    if (!planId) {
      return {
        success: false,
        output: chalk.red('Usage: /plan:load <plan-id>'),
      };
    }

    const plan = await this.planMode.load(planId);

    if (!plan) {
      return {
        success: false,
        output: chalk.red(`Plan not found: ${planId}`),
      };
    }

    return {
      success: true,
      output: [
        chalk.green(`Plan loaded successfully.`),
        '',
        `  ${chalk.cyan('Name:')}    ${plan.name}`,
        `  ${chalk.cyan('ID:')}      ${plan.id.substring(0, 8)}`,
        `  ${chalk.cyan('Changes:')} ${plan.changes.length}`,
        `  ${chalk.cyan('Status:')}  ${plan.status}`,
        '',
        chalk.dim('Use /plan:show to view changes.'),
      ].join('\n'),
      action: 'plan_mode',
      planModeChange: 'enter',
    };
  }

  /**
   * Handle /plan:list - List all saved plans
   */
  private async handlePlanList(): Promise<CommandResult> {
    const plans = await this.planMode.listPlans();

    if (plans.length === 0) {
      return {
        success: true,
        output: chalk.dim('No saved plans found.'),
      };
    }

    const output = [chalk.bold('Saved Plans:'), ''];

    for (const plan of plans) {
      const date = new Date(plan.updatedAt).toLocaleString();
      const id = plan.id.substring(0, 8);
      const isCurrent = this.planMode.plan?.id === plan.id;
      const marker = isCurrent ? chalk.green('● ') : '  ';
      const currentLabel = isCurrent ? chalk.green(' (current)') : '';

      output.push(`${marker}${chalk.cyan(id)}: ${chalk.bold(plan.name)}${currentLabel}`);
      output.push(`    ${chalk.dim(date)} • ${plan.changesCount} changes`);
    }

    output.push('');
    output.push(chalk.dim('Use /plan:load <id> to load a plan'));

    return {
      success: true,
      output: output.join('\n'),
      action: 'plan_mode',
    };
  }

  /**
   * Handle /plan:auto - Toggle auto-accept mode
   */
  private handlePlanAutoAccept(args: string[]): CommandResult {
    const value = args[0]?.toLowerCase();

    if (value === 'on' || value === 'true' || value === '1') {
      this.planMode.setAutoAccept(true);
      return {
        success: true,
        output: chalk.green('Auto-accept enabled. Changes will be automatically approved.'),
      };
    } else if (value === 'off' || value === 'false' || value === '0') {
      this.planMode.setAutoAccept(false);
      return {
        success: true,
        output: chalk.green('Auto-accept disabled. Changes require manual approval.'),
      };
    } else if (!value) {
      // Toggle
      const newValue = !this.planMode.autoAccept;
      this.planMode.setAutoAccept(newValue);
      return {
        success: true,
        output: chalk.green(`Auto-accept ${newValue ? 'enabled' : 'disabled'}.`),
      };
    }

    return {
      success: false,
      output: chalk.red('Usage: /plan:auto [on|off]'),
    };
  }

}

