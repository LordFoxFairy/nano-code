import { describe, it, expect } from 'vitest';
import {
  isToolAllowed,
  filterTools,
  createToolRestrictionMiddleware,
  parseAllowedTools,
  formatAllowedTools,
} from '../../../src/middleware/tool-restriction';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// Mock tool for testing
class MockTool extends StructuredTool {
  name: string;
  description = 'Mock tool';
  schema = z.object({});

  constructor(name: string) {
    super();
    this.name = name;
  }

  async _call(): Promise<string> {
    return 'result';
  }
}

describe('isToolAllowed', () => {
  it('should allow all tools when no restrictions', () => {
    const result = isToolAllowed('AnyTool', {});
    expect(result.allowed).toBe(true);
  });

  it('should allow all tools when allowedTools is empty', () => {
    const result = isToolAllowed('AnyTool', { allowedTools: [] });
    expect(result.allowed).toBe(true);
  });

  it('should allow tool when in allowedTools list', () => {
    const result = isToolAllowed('Read', { allowedTools: ['Read', 'Write', 'Glob'] });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should block tool when not in allowedTools list', () => {
    const result = isToolAllowed('Bash', { allowedTools: ['Read', 'Write', 'Glob'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Bash');
    expect(result.reason).toContain('not in the allowed');
  });

  it('should be case-insensitive', () => {
    const result = isToolAllowed('READ', { allowedTools: ['read', 'write'] });
    expect(result.allowed).toBe(true);
  });
});

describe('filterTools', () => {
  const tools = [
    new MockTool('Read'),
    new MockTool('Write'),
    new MockTool('Bash'),
    new MockTool('Glob'),
  ];

  it('should return all tools when no restrictions', () => {
    const filtered = filterTools(tools);
    expect(filtered).toHaveLength(4);
  });

  it('should return all tools when allowedToolNames is empty', () => {
    const filtered = filterTools(tools, []);
    expect(filtered).toHaveLength(4);
  });

  it('should filter to only allowed tools', () => {
    const filtered = filterTools(tools, ['Read', 'Glob']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).toEqual(['Read', 'Glob']);
  });

  it('should be case-insensitive', () => {
    const filtered = filterTools(tools, ['read', 'WRITE']);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).toEqual(['Read', 'Write']);
  });
});

describe('createToolRestrictionMiddleware', () => {
  it('should allow execution when tool is allowed', async () => {
    const middleware = createToolRestrictionMiddleware({
      allowedTools: ['Read', 'Write'],
    });

    const result = await middleware('Read', {}, async () => 'executed');
    expect(result).toBe('executed');
  });

  it('should return error message when tool is blocked', async () => {
    const middleware = createToolRestrictionMiddleware({
      allowedTools: ['Read', 'Write'],
    });

    const result = await middleware('Bash', {}, async () => 'executed');
    expect(result).toContain('Error');
    expect(result).toContain('Bash');
  });

  it('should throw when throwOnBlocked is true', async () => {
    const middleware = createToolRestrictionMiddleware({
      allowedTools: ['Read', 'Write'],
      throwOnBlocked: true,
    });

    await expect(middleware('Bash', {}, async () => 'executed')).rejects.toThrow('Bash');
  });

  it('should allow all tools when no restrictions', async () => {
    const middleware = createToolRestrictionMiddleware({});

    const result = await middleware('AnyTool', {}, async () => 'executed');
    expect(result).toBe('executed');
  });
});

describe('parseAllowedTools', () => {
  it('should return empty array for undefined', () => {
    expect(parseAllowedTools(undefined)).toEqual([]);
  });

  it('should handle array input', () => {
    expect(parseAllowedTools(['Read', 'Write'])).toEqual(['Read', 'Write']);
  });

  it('should parse comma-separated string', () => {
    expect(parseAllowedTools('Read, Write, Glob')).toEqual(['Read', 'Write', 'Glob']);
  });

  it('should parse space-separated string', () => {
    expect(parseAllowedTools('Read Write Glob')).toEqual(['Read', 'Write', 'Glob']);
  });

  it('should handle mixed separators', () => {
    expect(parseAllowedTools('Read, Write Glob')).toEqual(['Read', 'Write', 'Glob']);
  });

  it('should filter empty strings', () => {
    expect(parseAllowedTools('Read,  , Write')).toEqual(['Read', 'Write']);
  });
});

describe('formatAllowedTools', () => {
  it('should return "All tools allowed" for undefined', () => {
    expect(formatAllowedTools()).toBe('All tools allowed');
  });

  it('should return "All tools allowed" for empty array', () => {
    expect(formatAllowedTools([])).toBe('All tools allowed');
  });

  it('should format tool list', () => {
    expect(formatAllowedTools(['Read', 'Write', 'Glob'])).toBe('Allowed tools: Read, Write, Glob');
  });
});
