import { ResolvedRoute, NanoConfig, ProviderType } from './types.js';
import { ConfigError, ConfigErrorCode } from '../errors/index.js';

/**
 * Parses a "provider:model" string into its components
 *
 * @param route - string in "provider:model" format (e.g., "anthropic:claude-3-opus", "ollama:qwen2.5:32b")
 * @returns Object containing providerName and modelId
 * @throws ConfigError if format is invalid
 */
export function parseRoute(route: string): ResolvedRoute {
  if (!route || typeof route !== 'string') {
    throw new ConfigError(
      `Invalid route format: ${route}`,
      ConfigErrorCode.INVALID_ROUTE_FORMAT,
      'Route must be a non-empty string in "provider:model" format'
    );
  }

  const firstColonIndex = route.indexOf(':');

  if (firstColonIndex === -1) {
    throw new ConfigError(
      `Invalid route format: "${route}"`,
      ConfigErrorCode.INVALID_ROUTE_FORMAT,
      'Route must contain a colon separator (e.g., "provider:model")'
    );
  }

  const providerName = route.substring(0, firstColonIndex);
  const modelId = route.substring(firstColonIndex + 1);

  if (!providerName || !modelId) {
    throw new ConfigError(
      `Invalid route format: "${route}"`,
      ConfigErrorCode.INVALID_ROUTE_FORMAT,
      'Both provider and model must be specified'
    );
  }

  return { providerName, modelId };
}

/**
 * Resolves environment variables in configuration strings
 * Supports:
 * - $VAR
 * - ${VAR}
 * - ${VAR:-default}
 *
 * @param value - The parsing string
 * @returns Resolved value or original string if not an env var reference
 * @throws ConfigError if env var is missing and no default provided
 */
export function resolveEnvVar(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // Handle ${VAR:-default}
  const defaultMatch = value.match(/^\$\{([a-zA-Z_][a-zA-Z0-9_]*):-(.*)\}$/);
  if (defaultMatch) {
    const varName = defaultMatch[1];
    const defaultValue = defaultMatch[2];
    if (!varName || !defaultValue) {
        throw new ConfigError(
            `Invalid environment variable format: "${value}"`,
             ConfigErrorCode.ENV_VAR_NOT_SET,
             'Use $VAR, ${VAR}, or ${VAR:-default} format'
        );
    }
    return process.env[varName] || defaultValue;
  }

  // Handle ${VAR}
  const braceMatch = value.match(/^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/);
  if (braceMatch) {
    const varName = braceMatch[1];
    if (!varName) {
        throw new ConfigError(
            `Invalid environment variable format: "${value}"`,
            ConfigErrorCode.ENV_VAR_NOT_SET,
            'Use $VAR, ${VAR}, or ${VAR:-default} format'
        );
    }
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new ConfigError(
        `Environment variable ${varName} is not set`,
        ConfigErrorCode.ENV_VAR_NOT_SET,
        `Please set ${varName} in your environment or .env file`
      );
    }
    return envValue;
  }

  // Handle $VAR
  const simpleMatch = value.match(/^\$([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (simpleMatch) {
    const varName = simpleMatch[1];
    if (!varName) {
        throw new ConfigError(
             `Invalid environment variable format: "${value}"`,
             ConfigErrorCode.ENV_VAR_NOT_SET,
             'Use $VAR, ${VAR}, or ${VAR:-default} format'
        );
    }
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new ConfigError(
        `Environment variable ${varName} is not set`,
        ConfigErrorCode.ENV_VAR_NOT_SET,
        `Please set ${varName} in your environment or .env file`
      );
    }
    return envValue;
  }

  // Check for invalid env var format (starts with $ but doesn't match any pattern)
  if (value.startsWith('$')) {
    throw new ConfigError(
      `Invalid environment variable format: "${value}"`,
      ConfigErrorCode.ENV_VAR_NOT_SET,
      'Use $VAR, ${VAR}, or ${VAR:-default} format'
    );
  }

  // Not an env var reference, return as is
  return value;
}

/**
 * Infers the provider type based on the provider name or base URL
 *
 * @param name - Provider name
 * @param baseUrl - Optional base URL
 * @returns Inferred ProviderType
 */
export function inferProviderType(name: string, _baseUrl?: string): ProviderType {
  const lowerName = name.toLowerCase();

  if (lowerName === 'anthropic' || lowerName.includes('anthropic')) {
    return 'anthropic';
  }

  if (lowerName === 'ollama' || lowerName.includes('ollama')) {
    return 'ollama';
  }

  // Check for common local/compatible names
  if (['local', 'lmstudio', 'vllm', 'openrouter', 'deepseek'].includes(lowerName)) {
    return 'openai-compatible';
  }

  return 'openai-compatible';
}

/**
 * Validates that router models exist in the provider configuration
 *
 * @param config - The full NanoConfig object
 * @throws ConfigError if validation fails
 */
export function validateRouterModels(config: NanoConfig): void {
  const { router, providers, settings } = config;

  // Validate basic structure exists
  if (!router) {
    throw new ConfigError(
      'Missing router configuration',
      ConfigErrorCode.MISSING_REQUIRED_FIELD,
      'Configuration must include a "router" section'
    );
  }

  if (!providers || !Array.isArray(providers)) {
    throw new ConfigError(
      'Missing providers configuration',
      ConfigErrorCode.MISSING_REQUIRED_FIELD,
      'Configuration must include a "providers" array'
    );
  }

  const routerKeys = ['opus', 'sonnet', 'haiku'] as const;

  // Check each route - skip empty entries (user hasn't configured yet)
  for (const key of routerKeys) {
    const routeString = router[key as 'opus' | 'sonnet' | 'haiku'];
    if (!routeString) {
      // Empty string means not configured - skip validation for this entry
      continue;
    }

    try {
      // Parse the route string
      const { providerName: parsedProviderName, modelId } = parseRoute(routeString);

      // Find the provider in the configuration
      // We look for a provider whose name matches the provider part of the route string
      const provider = providers.find(p => p.name === parsedProviderName);

      if (!provider) {
        throw new ConfigError(
          `Provider "${parsedProviderName}" referenced in router.${key} not found`,
          ConfigErrorCode.PROVIDER_NOT_FOUND,
          `Define a provider named "${parsedProviderName}" in the providers list`
        );
      }

      // If the provider has a models list, verify the model is in it
      if (provider.models && Array.isArray(provider.models) && provider.models.length > 0) {
        if (!provider.models.includes(modelId)) {
          throw new ConfigError(
            `Model "${modelId}" not found in provider "${parsedProviderName}" configuration`,
            ConfigErrorCode.MODEL_NOT_FOUND,
            `Available models for ${parsedProviderName}: ${provider.models.join(', ')}`
          );
        }
      }
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      // Rethrow unexpected errors as config errors
      throw new ConfigError(
        `Error validating router.${key}: ${(error as Error).message}`,
        ConfigErrorCode.INVALID_ROUTE_FORMAT
      );
    }
  }

  // Check default mode if specified
  if (settings?.defaultMode) {
    if (!routerKeys.includes(settings.defaultMode)) {
      throw new ConfigError(
        `Invalid default mode: "${settings.defaultMode}"`,
        ConfigErrorCode.INVALID_JSON, // Using generic error for logic
        `Default mode must be one of: ${routerKeys.join(', ')}`
      );
    }
  }
}
