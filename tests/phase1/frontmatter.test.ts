import { describe, it, expect } from 'vitest';
import { parseFrontmatter, hasFrontmatter } from '../../src/core/utils/frontmatter.js';

describe('frontmatter', () => {
  describe('hasFrontmatter', () => {
    it('should return true for content with frontmatter', () => {
      const content = `---
name: test
description: A test
---

# Content`;
      expect(hasFrontmatter(content)).toBe(true);
    });

    it('should return false for content without frontmatter', () => {
      const content = `# No Frontmatter

Just content here.`;
      expect(hasFrontmatter(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(hasFrontmatter('')).toBe(false);
    });

    it('should return false for content starting with --- but no closing', () => {
      const content = `---
name: test
# No closing delimiter`;
      expect(hasFrontmatter(content)).toBe(false);
    });
  });

  describe('parseFrontmatter', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
allowed-tools: Bash, Read
---

# Content`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({
        name: 'test-skill',
        description: 'A test skill',
        'allowed-tools': 'Bash, Read',
      });
      expect(result.content.trim()).toBe('# Content');
    });

    it('should return empty frontmatter for content without frontmatter', () => {
      const content = `# No Frontmatter

Just content.`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(content);
    });

    it('should handle empty content', () => {
      const result = parseFrontmatter('');

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe('');
    });

    it('should parse frontmatter with boolean values', () => {
      const content = `---
name: test
disable-model-invocation: true
---

Content`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter['disable-model-invocation']).toBe(true);
    });

    it('should handle multiline description in frontmatter', () => {
      const content = `---
name: test
description: |
  This is a multiline
  description
---

Content`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter.description).toContain('multiline');
    });

    it('should handle invalid YAML gracefully', () => {
      const content = `---
name: [invalid yaml
description:
---

Content`;

      // Should not throw, return empty frontmatter
      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({});
    });
  });
});
