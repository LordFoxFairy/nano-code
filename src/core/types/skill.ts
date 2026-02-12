/**
 * Skill System Types
 * Defines the structure for progressive disclosure skills
 */

export type RouterMode = 'opus' | 'sonnet' | 'haiku';

/**
 * SKILL.md frontmatter structure
 */
export interface SkillFrontmatter {
  /** Unique skill identifier (kebab-case) */
  name: string;
  /** Description with trigger phrases */
  description: string;
  /** Semantic version */
  version?: string;
  /** Explicit trigger phrases (extracted from description + manual) */
  triggers?: string[];
  /** Restrict tools available to this skill */
  allowedTools?: string[];
  /** Override model for this skill */
  model?: RouterMode;
}

/**
 * Complete skill definition including content and paths
 */
export interface SkillDefinition {
  /** Full path to skill directory */
  path: string;
  /** Parsed frontmatter */
  frontmatter: SkillFrontmatter;
  /** Markdown content (without frontmatter) */
  content: string;
  /** Path to scripts/ directory if exists */
  scriptsDir?: string;
  /** Path to references/ directory if exists */
  referencesDir?: string;
}

/**
 * Result of matching user input to a skill
 */
export interface SkillMatchResult {
  /** Matched skill */
  skill: SkillDefinition;
  /** Match confidence score (0-1) */
  score: number;
  /** The trigger that matched */
  matchedTrigger?: string;
}
