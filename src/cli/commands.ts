import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import type { Session } from './session.js';

export interface CommandResult {
  success: boolean;
  output: string;
  skillContext?: string;
  skillName?: string;
}

interface SkillDefinition {
  name: string;
  commands: string[];
  content: string;
  description: string;
  commandContents: Map<string, string>; // Maps command name to its specific content
}

export class CommandHandler {
  private skills: Map<string, SkillDefinition> = new Map();
  private commandToSkill: Map<string, SkillDefinition> = new Map();

  constructor(private readonly session: Session) {
    this.loadSkills();
  }

  private loadSkills() {
    const skillsDir = path.join(process.cwd(), '.agents', 'skills');
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
                commands.push(cmdName);
                commandContents.set(cmdName, cmdContent);
              }
            }

            // Unique commands
            const uniqueCommands = [...new Set(commands)];

            const skillDef = { name, commands: uniqueCommands, content, description, commandContents };
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

  getSkillCommand(command: string): string | null {
    const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
    const skill = this.commandToSkill.get(cleanCommand);
    if (!skill) return null;

    // Check if there's a specific command content for this command
    const specificContent = skill.commandContents.get(cleanCommand);
    if (specificContent) {
      // Return both skill context and specific command content
      return `${skill.content}\n\n---\n\n# Command: /${cleanCommand}\n\n${specificContent}`;
    }

    return skill.content;
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

      default:
        // Check for skill command
        const skillContent = this.getSkillCommand(command);
        if (skillContent) {
          // We found a matching skill
          const cleanCommand = command.startsWith('/') ? command.slice(1) : command;
          const skillDef = this.commandToSkill.get(cleanCommand);

          return {
            success: true,
            output: `Activated skill: ${skillDef?.name}`,
            skillContext: skillContent,
            skillName: skillDef?.name,
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
      '  /exit           Exit NanoCode',
      '  /bug            Report a bug (not implemented)',
      '  /cost           Show current session cost (not implemented)',
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
}
