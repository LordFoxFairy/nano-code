/**
 * Preprocessor Tests (Phase 1.1)
 *
 * Tests based on PHASE1.1-DESIGN.md specification:
 * - Shell commands: !`command` or !command
 * - Skill invocation: /skillName [args]
 * - File references: @path/to/file
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Preprocessor } from '../../src/core/routing/preprocessor.js';
import type { PreprocessingResult } from '../../src/types/index.js';

describe('Preprocessor', () => {
  let preprocessor: Preprocessor;

  beforeEach(() => {
    preprocessor = new Preprocessor();
  });

  describe('Plain text input', () => {
    it('should pass through plain text unchanged', async () => {
      const result = await preprocessor.execute('hello world');

      expect(result.cleanedContent).toBe('hello world');
      expect(result.commands).toHaveLength(0);
      expect(result.fileReferences).toHaveLength(0);
      expect(result.shouldHaltConversation).toBe(false);
    });

    it('should handle empty input', async () => {
      const result = await preprocessor.execute('');

      expect(result.cleanedContent).toBe('');
      expect(result.commands).toHaveLength(0);
      expect(result.shouldHaltConversation).toBe(false);
    });

    it('should handle multiline plain text', async () => {
      const input = 'line one\nline two\nline three';
      const result = await preprocessor.execute(input);

      expect(result.cleanedContent).toBe(input);
      expect(result.commands).toHaveLength(0);
      expect(result.shouldHaltConversation).toBe(false);
    });
  });

  describe('Slash Commands (/skill)', () => {
    it('should extract simple slash command', async () => {
      const result = await preprocessor.execute('/commit');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'commit',
        args: [],
        type: 'skill',
        originalString: '/commit',
      });
      expect(result.shouldHaltConversation).toBe(true);
    });

    it('should extract slash command with arguments', async () => {
      const result = await preprocessor.execute('/commit -m "fix bug"');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'commit',
        type: 'skill',
      });
      expect(result.commands[0].args).toContain('-m');
      expect(result.commands[0].args).toContain('fix bug');
      expect(result.shouldHaltConversation).toBe(true);
    });

    it('should extract slash command with single-quoted arguments', async () => {
      const result = await preprocessor.execute("/commit -m 'wip'");

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].args).toContain('-m');
      expect(result.commands[0].args).toContain('wip');
    });

    it('should extract pr-review with number argument', async () => {
      const result = await preprocessor.execute('/pr-review 123');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'pr-review',
        args: ['123'],
        type: 'skill',
      });
    });

    it('should not treat / in middle of text as command', async () => {
      const result = await preprocessor.execute('check path/to/file');

      expect(result.commands).toHaveLength(0);
      expect(result.cleanedContent).toBe('check path/to/file');
    });
  });

  describe('Shell Commands (!command)', () => {
    it('should extract simple shell command', async () => {
      const result = await preprocessor.execute('!ls -la');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'ls -la',
        type: 'shell',
      });
      expect(result.shouldHaltConversation).toBe(true);
    });

    it('should extract backtick-wrapped shell command', async () => {
      const result = await preprocessor.execute('!`ls -la`');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'ls -la',
        type: 'shell',
        originalString: '!`ls -la`',
      });
    });

    it('should extract npm command', async () => {
      const result = await preprocessor.execute('!npm test');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({
        name: 'npm test',
        type: 'shell',
      });
    });

    it('should handle complex shell command with pipes', async () => {
      const result = await preprocessor.execute('!`git log --oneline | head -5`');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe('git log --oneline | head -5');
      expect(result.commands[0].type).toBe('shell');
    });

    it('should not treat ! in middle of sentence as command', async () => {
      const result = await preprocessor.execute('wow! this is great');

      expect(result.commands).toHaveLength(0);
      expect(result.cleanedContent).toBe('wow! this is great');
    });
  });

  describe('File References (@file)', () => {
    it('should extract simple file reference', async () => {
      const result = await preprocessor.execute('@src/index.ts');

      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0]).toMatchObject({
        token: '@src/index.ts',
        path: 'src/index.ts',
      });
    });

    it('should extract file reference in command', async () => {
      const result = await preprocessor.execute('/review @src/index.ts');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe('review');
      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('src/index.ts');
    });

    it('should extract multiple file references', async () => {
      const result = await preprocessor.execute(
        'compare @src/old.ts and @src/new.ts',
      );

      expect(result.fileReferences).toHaveLength(2);
      expect(result.fileReferences[0].path).toBe('src/old.ts');
      expect(result.fileReferences[1].path).toBe('src/new.ts');
    });

    it('should not treat @ in email as file reference', async () => {
      const result = await preprocessor.execute('email me at user@example.com');

      expect(result.fileReferences).toHaveLength(0);
      expect(result.cleanedContent).toContain('user@example.com');
    });

    it('should handle file path with dots', async () => {
      const result = await preprocessor.execute('@src/core/router.test.ts');

      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('src/core/router.test.ts');
    });
  });

  describe('Mixed Input', () => {
    it('should handle skill command with file reference', async () => {
      const result = await preprocessor.execute('/explain @src/core/router.ts');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].name).toBe('explain');
      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('src/core/router.ts');
    });

    it('should handle text with file reference', async () => {
      const result = await preprocessor.execute('check this @src/file.ts');

      expect(result.cleanedContent).toBe('check this @src/file.ts');
      expect(result.fileReferences).toHaveLength(1);
      expect(result.shouldHaltConversation).toBe(false);
    });

    it('should handle multiple commands', async () => {
      const result = await preprocessor.execute('/commit\n!npm test');

      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].type).toBe('skill');
      expect(result.commands[1].type).toBe('shell');
    });

    it('should set shouldHaltConversation based on content', async () => {
      // Pure command - should halt
      const pureCommand = await preprocessor.execute('/commit');
      expect(pureCommand.shouldHaltConversation).toBe(true);

      // Mixed content - should not halt
      const mixed = await preprocessor.execute(
        'please review this @src/file.ts',
      );
      expect(mixed.shouldHaltConversation).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle escaped characters', async () => {
      const result = await preprocessor.execute('/commit -m "fix: don\'t break"');

      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].args).toContain("fix: don't break");
    });

    it('should handle unicode in file paths', async () => {
      const result = await preprocessor.execute('@docs/文档.md');

      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('docs/文档.md');
    });

    it('should handle relative paths with ..', async () => {
      const result = await preprocessor.execute('@../parent/file.ts');

      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('../parent/file.ts');
    });

    it('should handle absolute paths', async () => {
      const result = await preprocessor.execute('@/absolute/path/file.ts');

      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].path).toBe('/absolute/path/file.ts');
    });
  });
});
