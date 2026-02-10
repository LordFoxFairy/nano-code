/**
 * SkillsContext (Phase 1.1)
 *
 * Runtime management of Skills for injection into System Prompt.
 * Supports L1 (metadata only) and L2 (full content) injection modes.
 *
 * Design aligned with Claude Code's progressive disclosure pattern.
 */

import type { Skill, SkillsContextConfig } from '../types';
import { SkillLoader } from './skill-loader.js';
import { PromptInjector } from './prompt-injector.js';

export class SkillsContext {
  private readonly skills: Map<string, Skill> = new Map();
  private readonly injectionLevel: 'L1' | 'L2';
  private readonly promptInjector: PromptInjector;

  constructor(config: SkillsContextConfig = {}) {
    this.injectionLevel = config.injectionLevel || 'L1';
    this.promptInjector = new PromptInjector();
  }

  /**
   * Register a skill in the context
   */
  register(skill: Skill): void {
    if (!this.skills.has(skill.name)) {
      this.skills.set(skill.name, skill);
    }
  }

  /**
   * Get a skill by name
   */
  getSkillByName(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Check if a skill is registered
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Clear all registered skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Load skills from a directory
   */
  async loadFromDirectory(dir: string): Promise<void> {
    const loader = new SkillLoader(dir);
    const result = await loader.discoverAll();

    for (const skill of result.skills) {
      this.register(skill);
    }
  }

  /**
   * Generate skills prompt based on injection level
   *
   * L1: Metadata only (name + description), ~100 tokens per skill
   * L2: Full content, ~2k tokens per skill
   */
  getSkillsPrompt(): string {
    const skills = this.getAllSkills();

    if (skills.length === 0) {
      return '';
    }

    if (this.injectionLevel === 'L1') {
      return this.generateL1Prompt(skills);
    }

    return this.generateL2Prompt(skills);
  }

  /**
   * Get full content for a specific skill (L2 on-demand)
   */
  getSkillPrompt(name: string): string | undefined {
    const skill = this.skills.get(name);
    if (!skill) {
      return undefined;
    }
    return skill.content;
  }

  /**
   * Inject skills into a base prompt
   */
  injectIntoBasePrompt(basePrompt: string): string {
    const skillsPrompt = this.getSkillsPrompt();

    if (!skillsPrompt) {
      return basePrompt;
    }

    return `${basePrompt}\n\n${skillsPrompt}`;
  }

  /**
   * Generate L1 prompt (metadata only)
   */
  private generateL1Prompt(skills: Skill[]): string {
    const lines = skills.map((skill) => {
      const name = skill.frontmatter.name || skill.name;
      const desc = skill.frontmatter.description || '';
      return `- ${name}: ${desc}`;
    });

    return `Available Skills:\n${lines.join('\n')}`;
  }

  /**
   * Generate L2 prompt (full content)
   */
  private generateL2Prompt(skills: Skill[]): string {
    return this.promptInjector.injectMultipleSkills('', skills);
  }
}
