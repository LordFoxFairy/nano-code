import { z } from 'zod';

export const PluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),

  // Optional entry points if not using standard directory structure
  main: z.string().optional(),

  // Explicitly defined capabilities if needed, otherwise auto-discovered
  capabilities: z.object({
    skills: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    agents: z.array(z.string()).optional(),
    hooks: z.array(z.string()).optional(),
  }).optional(),

  // Plugin configuration schema
  config: z.record(z.unknown()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface Plugin {
  id: string; // unique identifier
  path: string; // root directory of the plugin
  manifest: PluginManifest;

  // Loaded resources
  skills: Map<string, unknown>;
  commands: Map<string, unknown>;
  agents: Map<string, unknown>;
  hooks: Map<string, unknown>;

  isActive: boolean;
}

export interface PluginContext {
  // Context passed to plugin functions
  cwd: string;
  config: Record<string, unknown>;
  logger: unknown; // Replace with actual logger type
}
