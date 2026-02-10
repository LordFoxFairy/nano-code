/**
 * SemanticRouter (Phase 1.1)
 *
 * LLM-based intent recognition for auto skill activation.
 * Analyzes user input and matches against skill descriptions.
 *
 * Design aligned with Claude Code's semantic matching mechanism:
 * - Description-driven matching ("This skill should be used when...")
 * - Respects disable-model-invocation flag
 * - Pluggable LLM provider interface
 */

import type { LLMProvider, RouterDecision, SemanticRouterConfig, Skill, SkillMatch } from '../types';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export class SemanticRouter {
  private readonly llmProvider?: LLMProvider;
  private readonly confidenceThreshold: number;

  constructor(config: SemanticRouterConfig = {}) {
    this.llmProvider = config.llmProvider;
    this.confidenceThreshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  /**
   * Match user input against available skills
   * Returns the best matching skill or null
   */
  async match(userInput: string, skills: Skill[]): Promise<SkillMatch | null> {
    const decision = await this.route(userInput, skills);
    return decision.match;
  }

  /**
   * Full routing decision with reasoning
   */
  async route(userInput: string, skills: Skill[]): Promise<RouterDecision> {
    // Handle edge cases
    if (!userInput || userInput.trim() === '') {
      return {
        shouldActivate: false,
        match: null,
        reasoning: 'Empty input',
      };
    }

    const autoSkills = this.getAutoSkills(skills);

    if (autoSkills.length === 0) {
      return {
        shouldActivate: false,
        match: null,
        reasoning: 'No auto-invocable skills available',
      };
    }

    // If no LLM provider, fallback to no matching
    if (!this.llmProvider) {
      return {
        shouldActivate: false,
        match: null,
        reasoning: 'No LLM provider configured',
      };
    }

    try {
      const prompt = this.buildMatchPrompt(userInput, skills);
      const response = await this.llmProvider.complete(prompt, {
        maxTokens: 500,
        temperature: 0,
      });

      const parsed = this.parseResponse(response, skills);

      if (!parsed || parsed.confidence < this.confidenceThreshold) {
        return {
          shouldActivate: false,
          match: null,
          reasoning: parsed
            ? `Confidence ${parsed.confidence} below threshold ${this.confidenceThreshold}`
            : 'Failed to parse LLM response',
        };
      }

      // Double-check the matched skill is auto-invocable
      if (parsed.skill.frontmatter['disable-model-invocation']) {
        return {
          shouldActivate: false,
          match: null,
          reasoning: `Skill ${parsed.skill.name} has disable-model-invocation: true`,
        };
      }

      return {
        shouldActivate: true,
        match: parsed,
        reasoning: parsed.reason || 'Matched by LLM',
      };
    } catch (error) {
      return {
        shouldActivate: false,
        match: null,
        reasoning: `LLM error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Filter skills to only auto-invocable ones
   * Skills with disable-model-invocation: true are excluded
   */
  getAutoSkills(skills: Skill[]): Skill[] {
    return skills.filter(
      (skill) => !skill.frontmatter['disable-model-invocation'],
    );
  }

  /**
   * Build the prompt for LLM matching
   */
  buildMatchPrompt(userInput: string, skills: Skill[]): string {
    const autoSkills = this.getAutoSkills(skills);

    const skillDescriptions = autoSkills
      .map((skill) => {
        const name = skill.frontmatter.name || skill.name;
        const desc = skill.frontmatter.description || '';
        return `- ${name}: ${desc}`;
      })
      .join('\n');

    return `You are a skill router. Analyze the user's input and determine which skill (if any) should be activated.

Available Skills:
${skillDescriptions}

User Input: "${userInput}"

Respond with a JSON object:
{
  "skill": "skill-name" or null,
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}

Rules:
1. Only match if the user's intent clearly aligns with a skill's description
2. Set confidence based on how well the input matches
3. Return null for skill if no good match exists
4. Be conservative - only activate skills when clearly appropriate

JSON Response:`;
  }

  /**
   * Parse LLM response into SkillMatch
   */
  parseResponse(response: string, skills: Skill[]): SkillMatch | null {
    try {
      // Extract JSON from response (handle potential markdown wrapping)
      const jsonMatch = response.match(/{[\s\S]*}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.skill) {
        return null;
      }

      // Find the matching skill
      const skill = skills.find(
        (s) =>
          s.name === parsed.skill ||
          s.frontmatter.name === parsed.skill,
      );

      if (!skill) {
        return null;
      }

      return {
        skill,
        confidence: parsed.confidence ?? 0,
        reason: parsed.reason,
      };
    } catch {
      return null;
    }
  }
}
