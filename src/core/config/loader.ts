import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { NanoConfig, ProviderConfig, SettingsConfig } from './types.js';
import { ConfigError, ConfigErrorCode } from '../errors/index.js';
import { validateRouterModels } from './parser.js';

const AGENTS_DIR_NAME = '.agents';
const CONFIG_FILE_NAME = 'config.json';

/**
 * Get the home directory at runtime (not at module load time)
 * This allows for proper mocking in tests
 */
function getHomeDir(): string {
  return os.homedir();
}

/**
 * Load and merge configuration from all sources
 *
 * Loading order (priority):
 * 1. Defaults (empty)
 * 2. Global config (~/.agents/config.json)
 * 3. Project config (./.agents/config.json) - Overrides global
 */
export async function loadConfig(options: { cwd?: string } = {}): Promise<NanoConfig> {
  const cwd = options.cwd || process.cwd();

  // 1. Start with defaults (empty)
  let config = getDefaultConfig();

  // 2. Load and merge global config (~/.agents/config.json)
  try {
    const globalConfigPath = path.join(getHomeDir(), AGENTS_DIR_NAME, CONFIG_FILE_NAME);
    const globalConfig = await readConfigFile(globalConfigPath);
    if (globalConfig) {
      config = mergeConfigs(config, globalConfig);
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
  }

  // 3. Load project config (./.agents/config.json)
  try {
    const projectConfigPath = path.join(cwd, AGENTS_DIR_NAME, CONFIG_FILE_NAME);
    const projectConfig = await readConfigFile(projectConfigPath);
    if (projectConfig) {
      config = mergeConfigs(config, projectConfig);
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error;
  }

  // 4. Validate the final configuration
  // Skip validation if config is empty (default) to support init flows
  // Also check if any other router keys are set besides opus
  if (
    config.providers.length > 0 ||
    config.router.opus !== '' ||
    config.router.sonnet !== '' ||
    config.router.haiku !== '' ||
    config.router.default !== ''
  ) {
    validateRouterModels(config);
  }

  return config;
}

/**
 * Merge two configurations
 * - providers: Deduplicate by name, local overrides global
 * - router: Shallow merge (override)
 * - settings: Deep merge
 */
export function mergeConfigs(global: NanoConfig, local: NanoConfig): NanoConfig {
  if (!local) return global;
  if (!global) return local;

  const result = {
    providers: mergeProviders(global.providers, local.providers),
    router: { ...global.router, ...local.router },
    settings: { ...global.settings },
  } as NanoConfig;

  if (local.settings) {
    result.settings = mergeSettings(result.settings, local.settings);
  }

  return result;
}

/**
 * Get the default configuration
 */
export function getDefaultConfig(): NanoConfig {
  // 空配置 - 用户必须自己配置 provider 和 router
  // 不硬编码任何默认值
  return {
    providers: [],
    router: {
      opus: '',
      sonnet: '',
      haiku: '',
      default: '',
    },
    settings: {
      defaultMode: 'sonnet',
      interruptOn: {
        write_file: true,
        edit_file: true,
        execute: true,
      },
      streaming: true,
    },
  };
}

// Helper functions

async function readConfigFile(filePath: string): Promise<NanoConfig | null> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;

    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as NanoConfig;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        `Invalid JSON in config file: ${filePath}`,
        ConfigErrorCode.INVALID_JSON,
        'Check the configuration file syntax.',
      );
    }
    throw error;
  }
}

function mergeProviders(
  globalList: ProviderConfig[],
  localList: ProviderConfig[],
): ProviderConfig[] {
  const providerMap = new Map<string, ProviderConfig>();

  // Add global providers
  if (globalList) {
    globalList.forEach((p) => providerMap.set(p.name, p));
  }

  // Add/Override local providers
  if (localList) {
    localList.forEach((p) => providerMap.set(p.name, p));
  }

  return Array.from(providerMap.values());
}

function mergeSettings(
  globalSettings?: SettingsConfig,
  localSettings?: SettingsConfig,
): SettingsConfig {
  const result: SettingsConfig = { ...(globalSettings || {}) };
  const local = localSettings || {};

  // Merge primitive fields and simple objects
  Object.assign(result, local);

  // Deep merge interruptOn if both exist
  if (globalSettings?.interruptOn || local.interruptOn) {
    result.interruptOn = {
      ...(globalSettings?.interruptOn || {}),
      ...(local.interruptOn || {}),
    };
  }

  return result;
}
