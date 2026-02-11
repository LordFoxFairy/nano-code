
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  ProviderType,
  RouterMode,
  NanoConfig,
} from '../config/types.js';
import { resolveEnvVar, parseRoute, inferProviderType } from '../config/parser.js';
import { ConfigError, ConfigErrorCode } from '../errors/index.js';

export class ModelResolver {
  /**
   * Resolve a chat model based on provider type and configuration
   */
  static resolve(
    type: ProviderType,
    modelName: string,
    options?: {
      apiKey?: string;
      baseUrl?: string;
    }
  ): BaseChatModel {
    switch (type) {
      case 'anthropic':
        return new ChatAnthropic({
          apiKey: options?.apiKey,
          model: modelName,
        });

      case 'openai-compatible':
        return new ChatOpenAI({
          apiKey: options?.apiKey,
          model: modelName,
          configuration: {
            baseURL: options?.baseUrl,
          },
        });

      case 'ollama':
        return new ChatOllama({
          baseUrl: options?.baseUrl || 'http://localhost:11434',
          model: modelName,
        });

      default:
        throw new ConfigError(
          `Unsupported provider type: ${type}`,
          ConfigErrorCode.UNSUPPORTED_PROVIDER_TYPE,
          'Supported types: anthropic, openai-compatible, ollama'
        );
    }
  }

  /**
   * Resolve a chat model by router mode from config
   */
  static resolveByMode(config: NanoConfig, mode: RouterMode): BaseChatModel {
    const validModes: RouterMode[] = ['opus', 'sonnet', 'haiku'];

    if (!validModes.includes(mode)) {
       throw new Error(`Invalid mode: ${mode}. Must be one of: opus, sonnet, haiku`);
    }

    // Get the route string (e.g., "anthropic:claude-opus-4")
    const route = config.router[mode];
    if (!route) {
        throw new ConfigError(
            `No route configured for mode: ${mode}`,
            ConfigErrorCode.MISSING_REQUIRED_FIELD,
            `Please configure router.${mode} in your config file`
        );
    }

    // Parse "provider:model" format
    const { providerName, modelId } = parseRoute(route);

    // Find the provider configuration
    const provider = config.providers.find((p) => p.name === providerName);
    if (!provider) {
        throw new ConfigError(
            `Provider "${providerName}" not found`,
            ConfigErrorCode.PROVIDER_NOT_FOUND,
            `Available: ${config.providers.map((p) => p.name).join(', ')}`
        );
    }

    // Resolve environment variables in apiKey if needed
    const apiKey = resolveEnvVar(provider.apiKey || '');
    const providerType = provider.type || inferProviderType(provider.name, provider.baseUrl);

    return ModelResolver.resolve(providerType, modelId, {
      apiKey,
      baseUrl: provider.baseUrl,
    });
  }
}
