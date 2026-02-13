
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PluginManager } from '../../../src/plugins/manager';
import { loadPlugin, discoverPlugins } from '../../../src/plugins/loader';
import { Plugin, PluginManifestSchema } from '../../../src/plugins/types';

// Mock fs and path dependencies
vi.mock('fs/promises');

describe('Plugin System', () => {

    // --- PluginManager Tests ---
    describe('PluginManager', () => {
        let manager: PluginManager;

        beforeEach(() => {
            manager = new PluginManager();
        });

        it('getPlugins() should return empty array initially', () => {
            expect(manager.getPlugins()).toEqual([]);
        });

        it('getPlugin() should return undefined for non-existent plugin', () => {
            expect(manager.getPlugin('non-existent')).toBeUndefined();
        });

        it('resolveCommand() should handle namespaced commands', async () => {
            // Setup a mock plugin with a command
            const mockPlugin: Plugin = {
                id: 'test-plugin',
                path: '/path/to/plugin',
                manifest: { name: 'test-plugin', version: '1.0.0' },
                skills: new Map(),
                commands: new Map([['test-cmd', '/path/to/plugin/commands/test-cmd.ts']]),
                agents: new Map(),
                hooks: new Map(),
                isActive: true
            };

            // Inject the plugin directly into the manager's map
            // Since `plugins` is private, we can use init with mocked discoverPlugins
            // OR simply cast to any to access private property for testing setup
            (manager as any).plugins.set('test-plugin', mockPlugin);

            // Test exactnamespaced resolution
            const resolved = manager.resolveCommand('test-plugin:test-cmd');
            expect(resolved).toBe('/path/to/plugin/commands/test-cmd.ts');
        });

        it('resolveCommand() should return null for invalid namespaced command', () => {
            const mockPlugin: Plugin = {
                id: 'test-plugin',
                path: '/path/to/plugin',
                manifest: { name: 'test-plugin', version: '1.0.0' },
                skills: new Map(),
                commands: new Map(),
                agents: new Map(),
                hooks: new Map(),
                isActive: true
            };
            (manager as any).plugins.set('test-plugin', mockPlugin);

            expect(manager.resolveCommand('test-plugin:non-existent')).toBeNull();
            expect(manager.resolveCommand('other-plugin:test-cmd')).toBeNull();
        });

        it('resolveCommand() should search all plugins for non-namespaced command', () => {
            const mockPlugin: Plugin = {
                id: 'test-plugin',
                path: '/path/to/plugin',
                manifest: { name: 'test-plugin', version: '1.0.0' },
                skills: new Map(),
                commands: new Map([['common-cmd', '/path/to/common.ts']]),
                agents: new Map(),
                hooks: new Map(),
                isActive: true
            };
            (manager as any).plugins.set('test-plugin', mockPlugin);

            expect(manager.resolveCommand('common-cmd')).toBe('/path/to/common.ts');
        });

        it('getAllSkills() should aggregate skills from all plugins', () => {
            const plugin1: Plugin = {
                id: 'p1',
                path: '/p1',
                manifest: { name: 'p1', version: '1.0' },
                skills: new Map([['skill1', '/p1/skills/skill1.ts']]),
                commands: new Map(),
                agents: new Map(),
                hooks: new Map(),
                isActive: true
            };

            const plugin2: Plugin = {
                id: 'p2',
                path: '/p2',
                manifest: { name: 'p2', version: '1.0' },
                skills: new Map([['skill2', '/p2/skills/skill2.ts']]),
                commands: new Map(),
                agents: new Map(),
                hooks: new Map(),
                isActive: true
            };

            (manager as any).plugins.set('p1', plugin1);
            (manager as any).plugins.set('p2', plugin2);

            const allSkills = manager.getAllSkills();

            // Should contain namespaced versions
            expect(allSkills.get('p1/skill1')).toBe('/p1/skills/skill1.ts');
            expect(allSkills.get('p2/skill2')).toBe('/p2/skills/skill2.ts');

            // Should contain bare versions if no conflict
            expect(allSkills.get('skill1')).toBe('/p1/skills/skill1.ts');
            expect(allSkills.get('skill2')).toBe('/p2/skills/skill2.ts');
        });
    });

    // --- Plugin Loader Tests ---
    describe('Plugin Loader', () => {
        const mockPluginDir = '/mock/plugin/dir';

        beforeEach(() => {
            vi.resetAllMocks();
        });

        it('loadPlugin() should return null if plugin.json is missing', async () => {
            vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

            const result = await loadPlugin(mockPluginDir);
            expect(result).toBeNull();
        });

        it('loadPlugin() should load valid plugin with manifest', async () => {
            const validManifest = {
                name: "test-plugin",
                version: "1.0.0",
                description: "A test plugin"
            };

            // Mock file system checks
            vi.mocked(fs.stat).mockImplementation(async (filePath) => {
                if (filePath === path.join(mockPluginDir, 'plugin.json')) return {} as any;
                if (filePath === path.join(mockPluginDir, 'skills')) return { isDirectory: () => true } as any;
                if (filePath === path.join(mockPluginDir, 'commands')) return { isDirectory: () => true } as any;
                return { isDirectory: () => false } as any;
            });

            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validManifest));

            // Mock directory listings
            vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
                const p = dirPath as string;
                if (p.endsWith('skills')) return ['my-skill.ts'] as any;
                if (p.endsWith('commands')) return ['my-cmd.ts'] as any;
                return [] as any;
            });

            const plugin = await loadPlugin(mockPluginDir);

            expect(plugin).not.toBeNull();
            expect(plugin?.id).toBe('test-plugin');
            expect(plugin?.manifest).toEqual(validManifest);
            expect(plugin?.skills.has('my-skill')).toBe(true);
            expect(plugin?.commands.has('my-cmd')).toBe(true);
            expect(plugin?.path).toBe(mockPluginDir);
        });

        it('should handle invalid manifest', async () => {
             const invalidManifest = {
                version: "1.0.0" // Missing name
            };

            vi.mocked(fs.stat).mockResolvedValue({} as any);
            vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidManifest));

            // Zod parsing should fail inside loadPlugin
            const plugin = await loadPlugin(mockPluginDir);
            expect(plugin).toBeNull();
        });

        it('discoverPlugins() should find plugins in standard directories', async () => {
            const cwd = '/current/working/dir';
            const projectPluginDir = path.join(cwd, '.agents', 'plugins');

            // Mock directory structure
            vi.mocked(fs.stat).mockImplementation(async (p) => {
                if (p === projectPluginDir) return { isDirectory: () => true } as any;
                return { isDirectory: () => false } as any;
            });

            // Mock readdir to return a plugin directory
            vi.mocked(fs.readdir).mockImplementation(async (p, opts) => {
                if (p === projectPluginDir) {
                    return [{
                        name: 'my-plugin',
                        isDirectory: () => true
                    }] as any;
                }
                return [] as any;
            });

            // Mock loadPlugin implicitly by mocking its internal calls or we can mock the module export itself...
            // But since we are testing integration of discoverPlugins with filesystem, let's just make the manifest read work
             vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
                 name: 'my-discovered-plugin',
                 version: '0.0.1'
             }));

             // We need fs.stat to return true for the plugin.json check inside loadPlugin
             // The previous mock for fs.stat was too restrictive
             vi.mocked(fs.stat).mockImplementation(async (p) => {
                const pathStr = p as string;
                if (pathStr === projectPluginDir) return { isDirectory: () => true } as any;
                if (pathStr.includes('plugin.json')) return {} as any; // Found manifest
                return { isDirectory: () => false } as any;
            });


            const plugins = await discoverPlugins(cwd);

            expect(plugins).toHaveLength(1);
            expect(plugins[0].id).toBe('my-discovered-plugin');
        });
    });

    // --- Manifest Schema Tests ---
    describe('PluginManifest Schema', () => {
        it('should validate correct manifest', () => {
            const valid = {
                name: "valid-plugin",
                version: "1.0.0",
                description: "Test",
                author: "Me",
                license: "MIT"
            };
            expect(PluginManifestSchema.safeParse(valid).success).toBe(true);
        });

        it('should require name and version', () => {
            const invalid = {
                description: "Missing mandatory fields"
            };
            expect(PluginManifestSchema.safeParse(invalid).success).toBe(false);
        });
    });

});
