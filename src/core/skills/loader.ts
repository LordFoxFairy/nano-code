/**
 * Skill Loader
 *
 * Discovers and loads skills from the .agents/skills/ directory.
 * Each skill is a directory containing at least a SKILL.md file.
 *
 * Also discovers:
 * - commands/*.md - User-invocable commands
 * - agents/*.md - Sub-agents for the skill
 * - hooks/hooks.json - Hook configurations
 */

import { readdir, readFile, stat } from 'fs/promises';
import { basename, join } from 'path';

import { parseFrontmatter } from '../utils/frontmatter.js';
import type {
  Agent,
  AgentFrontmatter,
  Command,
  CommandFrontmatter,
  HooksJson,
  Skill,
  SkillFrontmatter,
  SkillLoaderResult,
} from '../../types';

export class SkillLoader {
  private readonly skillsPath: string;
  private readonly skills: Map<string, Skill> = new Map();
  private readonly commands: Map<string, Command[]> = new Map();
  private readonly agents: Map<string, Agent[]> = new Map();
  private readonly hooks: Map<string, HooksJson> = new Map();

  constructor(skillsPath: string) {
    this.skillsPath = skillsPath;
  }

  /**
   * Discover all skills, commands, agents, and hooks
   */
  async discoverAll(): Promise<SkillLoaderResult> {
    // Clear all caches
    this.skills.clear();
    this.commands.clear();
    this.agents.clear();
    this.hooks.clear();

    try {
      const entries = await readdir(this.skillsPath, { withFileTypes: true });
      const directories = entries.filter((entry) => entry.isDirectory());

      // Load all skills in parallel
      await Promise.all(directories.map((dir) => this.loadSkillFull(dir.name)));

      return {
        skills: Array.from(this.skills.values()),
        commands: this.commands,
        agents: this.agents,
        hooks: this.hooks,
      };
    } catch {
      return {
        skills: [],
        commands: new Map(),
        agents: new Map(),
        hooks: new Map(),
      };
    }
  }

  /**
   * Discover all skills in the skills directory (legacy method)
   */
  async discoverSkills(): Promise<Skill[]> {
    const result = await this.discoverAll();
    return result.skills;
  }

  /**
   * Load a skill with all its components
   */
  private async loadSkillFull(dirName: string): Promise<void> {
    const skillPath = join(this.skillsPath, dirName);

    // Load SKILL.md first
    const skill = await this.loadSkill(dirName);
    if (!skill) {
      return; // No SKILL.md, skip this directory
    }

    this.skills.set(skill.name, skill);

    // Load commands, agents, hooks in parallel
    await Promise.all([
      this.loadCommands(skillPath, skill.name),
      this.loadAgents(skillPath, skill.name),
      this.loadHooks(skillPath, skill.name),
    ]);
  }

  /**
   * Load a single skill from a directory
   */
  private async loadSkill(dirName: string): Promise<Skill | null> {
    const skillPath = join(this.skillsPath, dirName);
    const skillMdPath = join(skillPath, 'SKILL.md');

    try {
      // Check if SKILL.md exists
      const skillMdStat = await stat(skillMdPath);
      if (!skillMdStat.isFile()) {
        return null;
      }

      // Read and parse SKILL.md
      const content = await readFile(skillMdPath, 'utf-8');
      const { frontmatter, content: bodyContent } = parseFrontmatter(content);

      // Use directory name as skill name if not specified in frontmatter
      const name = (frontmatter.name as string) || dirName;

      return {
        name,
        path: skillPath,
        frontmatter: this.validateSkillFrontmatter(frontmatter, name),
        content: bodyContent,
      };
    } catch {
      // SKILL.md doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Load commands from commands/ directory
   */
  private async loadCommands(skillPath: string, skillName: string): Promise<void> {
    const commandsPath = join(skillPath, 'commands');

    try {
      const entries = await readdir(commandsPath, { withFileTypes: true });
      const mdFiles = entries.filter(
        (entry) => entry.isFile() && entry.name.endsWith('.md')
      );

      const commands: Command[] = [];

      for (const file of mdFiles) {
        const command = await this.loadCommand(join(commandsPath, file.name));
        if (command) {
          commands.push(command);
        }
      }

      if (commands.length > 0) {
        this.commands.set(skillName, commands);
      }
    } catch {
      // No commands directory
    }
  }

  /**
   * Load a single command file
   */
  private async loadCommand(filePath: string): Promise<Command | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { frontmatter, content: bodyContent } = parseFrontmatter(content);

      // Use filename (without .md) as command name
      const name = basename(filePath, '.md');

      return {
        name,
        path: filePath,
        frontmatter: this.validateCommandFrontmatter(frontmatter),
        content: bodyContent,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load agents from agents/ directory
   */
  private async loadAgents(skillPath: string, skillName: string): Promise<void> {
    const agentsPath = join(skillPath, 'agents');

    try {
      const entries = await readdir(agentsPath, { withFileTypes: true });
      const mdFiles = entries.filter(
        (entry) => entry.isFile() && entry.name.endsWith('.md')
      );

      const agents: Agent[] = [];

      for (const file of mdFiles) {
        const agent = await this.loadAgent(join(agentsPath, file.name), skillName);
        if (agent) {
          agents.push(agent);
        }
      }

      if (agents.length > 0) {
        this.agents.set(skillName, agents);
      }
    } catch {
      // No agents directory
    }
  }

  /**
   * Load a single agent file
   */
  private async loadAgent(filePath: string, skillName: string): Promise<Agent | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { frontmatter, content: bodyContent } = parseFrontmatter(content);

      // Use filename (without .md) as fallback name
      const fileName = basename(filePath, '.md');
      const name = (frontmatter.name as string) || fileName;

      return {
        name,
        path: filePath,
        skillName, // For namespace isolation
        frontmatter: this.validateAgentFrontmatter(frontmatter, name),
        content: bodyContent,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load hooks from hooks/hooks.json
   */
  private async loadHooks(skillPath: string, skillName: string): Promise<void> {
    const hooksJsonPath = join(skillPath, 'hooks', 'hooks.json');

    try {
      const content = await readFile(hooksJsonPath, 'utf-8');
      const hooksJson = JSON.parse(content) as HooksJson;

      // Validate basic structure
      if (hooksJson && typeof hooksJson.hooks === 'object') {
        this.hooks.set(skillName, hooksJson);
      }
    } catch {
      // No hooks.json or invalid JSON
    }
  }

  /**
   * Validate and normalize skill frontmatter
   */
  private validateSkillFrontmatter(
    raw: Record<string, unknown>,
    defaultName: string
  ): SkillFrontmatter {
    return {
      name: (raw.name as string) || defaultName,
      description: (raw.description as string) || '',
      'allowed-tools': raw['allowed-tools'] as string | undefined,
      'disable-model-invocation': raw['disable-model-invocation'] as boolean | undefined,
    };
  }

  /**
   * Validate and normalize command frontmatter
   */
  private validateCommandFrontmatter(raw: Record<string, unknown>): CommandFrontmatter {
    return {
      name: raw.name as string | undefined,
      description: (raw.description as string) || '',
      'allowed-tools': raw['allowed-tools'] as string | undefined,
    };
  }

  /**
   * Validate and normalize agent frontmatter
   */
  private validateAgentFrontmatter(
    raw: Record<string, unknown>,
    defaultName: string
  ): AgentFrontmatter {
    return {
      name: (raw.name as string) || defaultName,
      description: (raw.description as string) || '',
      tools: raw.tools as string | undefined,
      model: raw.model as 'haiku' | 'sonnet' | 'opus' | 'inherit' | undefined,
      color: raw.color as string | undefined,
    };
  }

  /**
   * Get a skill by name
   */
  getSkillByName(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all discovered skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get commands for a skill
   */
  getCommandsForSkill(skillName: string): Command[] {
    return this.commands.get(skillName) || [];
  }

  /**
   * Get agents for a skill
   */
  getAgentsForSkill(skillName: string): Agent[] {
    return this.agents.get(skillName) || [];
  }

  /**
   * Get hooks for a skill
   */
  getHooksForSkill(skillName: string): HooksJson | undefined {
    return this.hooks.get(skillName);
  }
}
