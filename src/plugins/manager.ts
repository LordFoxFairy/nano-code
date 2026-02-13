// src/plugins/manager.ts

import * as path from 'path';
import { Plugin } from './types.js';
import { discoverPlugins, loadPlugin } from './loader.js';
import { NanoConfig } from '../core/config/types.js';

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private loaded = false;
  private config?: NanoConfig;

  constructor(config?: NanoConfig) {
    this.config = config;
  }

  /**
   * Initialize plugins from standard locations
   */
  async init(cwd: string = process.cwd()) {
    if (this.loaded) return;

    const plugins = await discoverPlugins(cwd);
    for (const plugin of plugins) {
      this.plugins.set(plugin.id, plugin);
      console.log(`Loaded plugin: ${plugin.manifest.name} v${plugin.manifest.version}`);
    }

    this.loaded = true;
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin
   */
  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Resolve a command path from a namespaced command string
   * e.g. "git:commit" -> /path/to/git/commands/commit.ts
   */
  resolveCommand(commandName: string): string | null {
    // Check if namespaced: plugin:command
    if (commandName.includes(':')) {
      const [pluginId, cmd] = commandName.split(':');
      const plugin = this.plugins.get(pluginId || '');
      if (plugin && cmd && plugin.commands.has(cmd)) {
        return plugin.commands.get(cmd);
      }
    } else {
      // Search all plugins for the command (first match wins, or maybe we should warn on conflict?)
      const pluginList = Array.from(this.plugins.values());
      for (const plugin of pluginList) {
        if (plugin.commands.has(commandName)) {
          return plugin.commands.get(commandName);
        }
      }
    }
    return null;
  }

  /**
   * Aggregate all skills from all plugins
   */
  getAllSkills(): Map<string, string> {
    const allSkills = new Map<string, string>();
    const pluginList = Array.from(this.plugins.values());
    for (const plugin of pluginList) {
      const skillEntries = Array.from(plugin.skills.entries());
      for (const [name, skillPath] of skillEntries) {
        // Namespacing for skills: plugin-name/skill-name
        const namespacedName = `${plugin.id}/${name}`;
        allSkills.set(namespacedName, skillPath);

        // Also expose as bare name if no conflict (optional strategy)
         if (!allSkills.has(name)) {
           allSkills.set(name, skillPath);
         }
      }
    }
    return allSkills;
  }

  /**
   * Load resources for a specific plugin
   */
  async loadPluginResources(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    // Logic to actually require/import the files would go here
    // or we might leave them as paths until execution time to keep startup fast
  }
}

// Singleton instance management if needed
let instance: PluginManager | null = null;

export function getPluginManager(config?: NanoConfig): PluginManager {
  if (!instance) {
    instance = new PluginManager(config);
  }
  return instance;
}
