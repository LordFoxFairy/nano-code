import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PermissionRule } from '../../../src/permissions/rules.js';
import { PermissionManager } from '../../../src/permissions/manager.js';
import { PermissionRuleConfig, PermissionRequest } from '../../../src/permissions/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock fs and os module
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn().mockReturnValue('/home/user'),
  };
});

describe('Permission System', () => {
  describe('PermissionRule', () => {
    it('matches exact tool name', () => {
      const config: PermissionRuleConfig = {
        tool: 'Bash',
        level: 'allow'
      };
      const rule = new PermissionRule(config);

      const request: PermissionRequest = {
        tool: 'Bash',
        arguments: { command: 'ls' }
      };

      expect(rule.matches(request)).toBe(true);

      const mismatchRequest: PermissionRequest = {
        tool: 'Write',
        arguments: { file_path: 'foo' }
      };
      expect(rule.matches(mismatchRequest)).toBe(false);
    });

    it('matches tool name with glob patterns', () => {
      const config: PermissionRuleConfig = {
        tool: 'Bash*',
        level: 'deny'
      };
      const rule = new PermissionRule(config);

      expect(rule.matches({ tool: 'Bash', arguments: {} })).toBe(true);
      expect(rule.matches({ tool: 'BashScript', arguments: {} })).toBe(true);
      expect(rule.matches({ tool: 'Write', arguments: {} })).toBe(false);

      const anyToolConfig: PermissionRuleConfig = {
        tool: '*',
        level: 'ask'
      };
      const anyRule = new PermissionRule(anyToolConfig);
      expect(anyRule.matches({ tool: 'Anything', arguments: {} })).toBe(true);
    });

    it('matches argument patterns', () => {
      const config: PermissionRuleConfig = {
        tool: 'Bash',
        arguments: 'ls*',
        level: 'allow'
      };
      const rule = new PermissionRule(config);

      // Should match ls command
      expect(rule.matches({ tool: 'Bash', arguments: { command: 'ls -la' } })).toBe(true);

      // Should not match other commands
      expect(rule.matches({ tool: 'Bash', arguments: { command: 'rm -rf /' } })).toBe(false);
    });

    it('matches stringified arguments', () => {
      const config: PermissionRuleConfig = {
        tool: 'Write',
        arguments: '**/test/**',
        level: 'allow'
      };
      const rule = new PermissionRule(config);

      // The previous test failed because minimatch usage was likely assuming full path match or glob behavior
      // is slightly different than expected for partial string matches.
      // minimatch("/path/to/test/file.ts", "*test*") should be true if * matches slashes?
      // By default minimatch DOES NOT match across slashes with *.
      // We need ** for that.

      expect(rule.matches({ tool: 'Write', arguments: { file_path: '/path/to/test/file.ts' } })).toBe(true);
      expect(rule.matches({ tool: 'Write', arguments: { file_path: '/path/to/file.ts' } })).toBe(false);
    });

    it('returns correct permission level', () => {
      const config: PermissionRuleConfig = {
        tool: 'Bash',
        level: 'deny'
      };
      const rule = new PermissionRule(config);
      expect(rule.level).toBe('deny');
    });

    it('matches regardless of arguments if arguments pattern is not provided', () => {
      const config: PermissionRuleConfig = {
        tool: 'Bash',
        level: 'allow'
      };
      const rule = new PermissionRule(config);

      expect(rule.matches({ tool: 'Bash', arguments: { command: 'ls' } })).toBe(true);
      expect(rule.matches({ tool: 'Bash', arguments: { command: 'rm' } })).toBe(true);
    });
  });

  describe('PermissionManager', () => {
    let manager: PermissionManager;
    const mockHomedir = '/home/user';

    beforeEach(() => {
      vi.clearAllMocks();

      // Mock homedir
      vi.mocked(os.homedir).mockReturnValue(mockHomedir);

      // Mock default empty config files
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        // Return false for config files by default to start fresh
        return false;
      });

      manager = new PermissionManager('/project/root');
    });

    it('getPermission returns "ask" by default when no rules match', () => {
      const request: PermissionRequest = {
        tool: 'UnknownTool',
        arguments: {}
      };
      expect(manager.getPermission(request)).toBe('ask');
    });

    it('addGlobalRule adds rules and saves them', () => {
      const rule: PermissionRuleConfig = {
        tool: 'MyTool',
        level: 'allow'
      };

      manager.addGlobalRule(rule);

      const configPath = path.join(mockHomedir, '.nanocode', 'permissions.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('"tool": "MyTool"'),
      );

      // Verify rule is active
      const permission = manager.getPermission({ tool: 'MyTool', arguments: {} });
      expect(permission).toBe('allow');
    });

    it('getPermission respects rule priority (newest added global rule first)', () => {
      // Add allow rule
      manager.addGlobalRule({ tool: 'Bash', level: 'allow' });
      // Add deny rule (should be first in list because of unshift)
      manager.addGlobalRule({ tool: 'Bash', level: 'deny' });

      const permission = manager.getPermission({ tool: 'Bash', arguments: {} });
      expect(permission).toBe('deny');
    });

    it('getPermission respects rule priority (project > global)', () => {
      // Global deny
      manager.addGlobalRule({ tool: 'Bash', level: 'deny' });

      // Project allow
      vi.spyOn(manager, 'saveProjectRules').mockImplementation(() => {}); // silence save
      manager.addProjectRule({ tool: 'Bash', level: 'allow' });

      const permission = manager.getPermission({ tool: 'Bash', arguments: {} });
      expect(permission).toBe('allow');
    });

    it('removeGlobalRule removes rule by index', () => {
      manager.addGlobalRule({ tool: 'Tool1', level: 'allow' });
      manager.addGlobalRule({ tool: 'Tool2', level: 'deny' });
      // Current rules: [Tool2(deny), Tool1(allow)]

      expect(manager.listGlobalRules()).toHaveLength(2);
      expect(manager.listGlobalRules()[0].tool).toBe('Tool2');

      manager.removeGlobalRule(0); // Remove Tool2

      expect(manager.listGlobalRules()).toHaveLength(1);
      expect(manager.listGlobalRules()[0].tool).toBe('Tool1');

      // Verify file updated
      const configPath = path.join(mockHomedir, '.nanocode', 'permissions.json');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('loads existing global rules on initialization', () => {
      const globalConfig = {
        rules: [
          { tool: 'ExistingTool', level: 'allow' }
        ]
      };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p.toString().includes('permissions.json');
      });

      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        return JSON.stringify(globalConfig);
      });

      const newManager = new PermissionManager();

      // Should find the rule loaded from file
      const permission = newManager.getPermission({ tool: 'ExistingTool', arguments: {} });
      expect(permission).toBe('allow');
    });
  });
});
