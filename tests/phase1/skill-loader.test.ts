import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLoader } from '../../src/core/skills/loader.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_PATH = join(__dirname, '../fixtures/skills');

describe('SkillLoader', () => {
  let loader: SkillLoader;

  beforeEach(() => {
    loader = new SkillLoader(FIXTURES_PATH);
  });

  describe('discoverSkills', () => {
    it('should discover skills with SKILL.md files', async () => {
      const skills = await loader.discoverSkills();

      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('test-skill');
    });

    it('should parse frontmatter correctly', async () => {
      const skills = await loader.discoverSkills();

      const testSkill = skills.find((s) => s.name === 'test-skill');
      expect(testSkill).toBeDefined();
      expect(testSkill?.frontmatter.name).toBe('test-skill');
      expect(testSkill?.frontmatter.description).toBe('A test skill for unit testing');
      expect(testSkill?.frontmatter['allowed-tools']).toBe('Bash, Read, Write');
    });

    it('should handle skills without frontmatter', async () => {
      const skills = await loader.discoverSkills();

      const noFrontmatterSkill = skills.find((s) => s.name === 'test-skill-no-frontmatter');
      // Should still be discovered but with empty/default frontmatter
      expect(noFrontmatterSkill).toBeDefined();
    });

    it('should skip directories without SKILL.md', async () => {
      const skills = await loader.discoverSkills();

      const emptySkill = skills.find((s) => s.name === 'empty-skill');
      expect(emptySkill).toBeUndefined();
    });

    it('should include content without frontmatter', async () => {
      const skills = await loader.discoverSkills();

      const testSkill = skills.find((s) => s.name === 'test-skill');
      expect(testSkill?.content).toContain('# Test Skill');
      expect(testSkill?.content).not.toContain('---');
    });
  });

  describe('getSkillByName', () => {
    it('should return skill by name', async () => {
      await loader.discoverSkills();

      const skill = loader.getSkillByName('test-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test-skill');
    });

    it('should return undefined for non-existent skill', async () => {
      await loader.discoverSkills();

      const skill = loader.getSkillByName('non-existent');
      expect(skill).toBeUndefined();
    });
  });

  describe('getAllSkills', () => {
    it('should return all discovered skills', async () => {
      await loader.discoverSkills();

      const skills = loader.getAllSkills();
      expect(skills.length).toBeGreaterThan(0);
    });

    it('should return empty array before discovery', () => {
      const skills = loader.getAllSkills();
      expect(skills).toEqual([]);
    });
  });
});
