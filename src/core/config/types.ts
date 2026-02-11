/**
 * NanoCode Config Types
 */

/**
 * Supported provider types
 */
export type ProviderType = 'anthropic' | 'openai-compatible' | 'ollama';

/**
 * Router mode for quick switching between models
 */
export type RouterMode = 'opus' | 'sonnet' | 'haiku';

/**
 * Configuration for a specific AI provider
 */
export interface ProviderConfig {
  /** Unique name for this provider instance (e.g., "anthropic", "openrouter") */
  name: string;

  /** Type of the provider (optional, inferred if not provided) */
  type?: ProviderType;

  /** Base URL for API requests (optional) */
  baseUrl?: string;

  /** API Key or environment variable reference (e.g., "$ANTHROPIC_API_KEY") */
  apiKey?: string;

  /** List of available models for this provider */
  models?: string[];

  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Router configuration mapping modes to specific provider:model pairs
 */
export interface RouterConfig {
  /** Model to use for complex tasks (Opus level) */
  opus: string;

  /** Model to use for standard tasks (Sonnet level) */
  sonnet: string;

  /** Model to use for fast/simple tasks (Haiku level) */
  haiku: string;

  /** Default fallback model config */
  default: string;
}

/**
 * Function type signature for inferring provider type
 */
export type InferProviderType = (config: Partial<ProviderConfig>) => ProviderType;


/**
 * Configuration for interruption behavior
 */
export interface InterruptConfig {
  /** Interrupt before writing files */
  write_file?: boolean;

  /** Interrupt before editing files */
  edit_file?: boolean;

  /** Interrupt before executing commands */
  execute?: boolean;
}

/**
 * General application settings
 */
export interface SettingsConfig {
  /** Default router mode to start with */
  defaultMode?: RouterMode;

  /** Interruption configuration */
  interruptOn?: InterruptConfig;

  /** Whether to enable streaming responses */
  streaming?: boolean;
}

/**
 * Main NanoCode configuration interface
 */
export interface NanoConfig {
  /** List of configured providers */
  providers: ProviderConfig[];

  /** Router configuration */
  router: RouterConfig;

  /** General settings */
  settings?: SettingsConfig;
}

/**
 * Represents a resolved route (provider and model)
 */
export interface ResolvedRoute {
  /** The name of the provider to use */
  providerName: string;

  /** The specific model ID to use */
  modelId: string;
}
