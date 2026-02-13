import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import type { Session } from './session.js';

export interface CommandResult {
  success: boolean;
  output: string;
  skillContext?: string;
  skillName?: string;
  allowedTools?: string[];
  model?: string;
  /** Flag indicating a history/save action was performed */
  action?: 'save' | 'history_show' | 'skills_list';
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

  constructor(
    private readonly session: Session,
    cwd?: string,
  ) {
    this.cwd = cwd || process.cwd();
    this.loadSkills();
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
      } catch (error: any) {
        const errorMsg = error.stderr || error.message || 'Command failed';
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
      } catch (error: any) {
        result = result.replace(match[0], `[Error reading ${filepath}: ${error.message}]`);
      }
    }

    return result;
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
}
