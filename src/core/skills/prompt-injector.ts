/**
 * Prompt Injector
 *
 * Injects skill content into system prompts.
 *
 * Design principles:
 * - Skills are Markdown files, injected directly
 * - No custom wrapping format
 * - Progressive disclosure: metadata (name + description) always visible,
 *   body content loaded when skill is triggered
 */

import type { Skill } from '../../types';

export class PromptInjector {
  /**
   * Inject a single skill into the base prompt
   *
   * Note: This is L2 injection (full content).
   * For L1 injection (metadata only), use injectSkillMetadata.
   */
  injectSkill(basePrompt: string, skill: Skill): string {
    if (!skill.content) {
      return basePrompt;
    }

    // Directly inject Markdown content
    const skillContent = skill.content;

    if (!basePrompt) {
      return skillContent;
    }

    return `${basePrompt}\n\n${skillContent}`;
  }

  /**
   * Inject multiple skills into the base prompt
   */
  injectMultipleSkills(basePrompt: string, skills: Skill[]): string {
    if (skills.length === 0) {
      return basePrompt;
    }

    const skillContents = skills
      .filter((skill) => skill.content)
      .map((skill) => skill.content);

    const combined = skillContents.join('\n\n');

    if (!basePrompt) {
      return combined;
    }

    return `${basePrompt}\n\n${combined}`;
  }

  /**
   * Inject skill metadata only (L1 - Progressive Disclosure)
   *
   * Only name and description, for context awareness without full content.
   */
  injectSkillMetadata(basePrompt: string, skills: Skill[]): string {
    if (skills.length === 0) {
      return basePrompt;
    }

    const metadataLines = skills.map((skill) => {
      const name = skill.frontmatter.name || skill.name;
      const desc = skill.frontmatter.description || '';
      return `- ${name}: ${desc}`;
    });

    const metadataSection = `Available Skills:\n${metadataLines.join('\n')}`;

    if (!basePrompt) {
      return metadataSection;
    }

    return `${basePrompt}\n\n${metadataSection}`;
  }
}
