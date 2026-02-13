// src/plugins/loader.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { Plugin, PluginManifestSchema } from './types.js';

/**
 * Validates and loads a plugin from a directory
 */
export async function loadPlugin(pluginDir: string): Promise<Plugin | null> {
  try {
    const manifestPath = path.join(pluginDir, 'plugin.json');

    const exists = await fs.stat(manifestPath).then(() => true).catch(() => false);
    if (!exists) {
      // Not a plugin directory
      return null;
    }

    const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    const manifestJson = JSON.parse(manifestRaw);

    // Validate manifest
    const manifest = PluginManifestSchema.parse(manifestJson);

    // Discovery of capabilities based on directory structure
    // This is a shallow discovery - actual loading happens when needed or explicitly initialized
    const skills = new Map();
    const commands = new Map();
    const agents = new Map();
    const hooks = new Map();

    // Check for standard directories
    const skillsDir = path.join(pluginDir, 'skills');
    if (await fs.stat(skillsDir).then(s => s.isDirectory()).catch(() => false)) {
      const skillFiles = await fs.readdir(skillsDir);
      for (const file of skillFiles) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const name = path.basename(file, path.extname(file));
          skills.set(name, path.join(skillsDir, file));
        }
      }
    }

    const commandsDir = path.join(pluginDir, 'commands');
    if (await fs.stat(commandsDir).then(s => s.isDirectory()).catch(() => false)) {
      const commandFiles = await fs.readdir(commandsDir);
      for (const file of commandFiles) {
        if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.md')) {
          const name = path.basename(file, path.extname(file));
          commands.set(name, path.join(commandsDir, file));
        }
      }
    }

    // Check for agents directory
    const agentsDir = path.join(pluginDir, 'agents');
    if (await fs.stat(agentsDir).then(s => s.isDirectory()).catch(() => false)) {
      const agentFiles = await fs.readdir(agentsDir);
      for (const file of agentFiles) {
        if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.md')) {
          const name = path.basename(file, path.extname(file));
          agents.set(name, path.join(agentsDir, file));
        }
      }
    }

    // Check for hooks directory
    const hooksDir = path.join(pluginDir, 'hooks');
    if (await fs.stat(hooksDir).then(s => s.isDirectory()).catch(() => false)) {
      const hookFiles = await fs.readdir(hooksDir);
      for (const file of hookFiles) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          const name = path.basename(file, path.extname(file));
          hooks.set(name, path.join(hooksDir, file));
        }
      }
    }

    return {
      id: manifest.name,
      path: pluginDir,
      manifest,
      skills,
      commands,
      agents,
      hooks,
      isActive: true
    };

  } catch (error) {
    console.warn(`Failed to load plugin from ${pluginDir}:`, error);
    return null;
  }
}

/**
 * Discovers plugins in standard locations
 */
export async function discoverPlugins(cwd: string): Promise<Plugin[]> {
  const plugins: Plugin[] = [];
  const searchPaths = [
    // Project local plugins
    path.join(cwd, '.agents', 'plugins'),
    // User global plugins (example path)
    path.join(process.env.HOME || '', '.nanocode', 'plugins'),
    // System plugins ?
  ];

  for (const searchPath of searchPaths) {
    try {
      if (await fs.stat(searchPath).then(s => s.isDirectory()).catch(() => false)) {
        const entries = await fs.readdir(searchPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginPath = path.join(searchPath, entry.name);
            const plugin = await loadPlugin(pluginPath);
            if (plugin) {
              plugins.push(plugin);
            }
          }
        }
      }
    } catch (e) {
      // Ignore directory access errors
    }
  }

  return plugins;
}
