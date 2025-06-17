import { AIProvider, ProviderConfig, ProviderFactory, ProviderName } from './types';
import { GoogleProvider } from './google';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OpenRouterProvider } from './openrouter';
import { getAllProviders, getProviderModels, getDefaultModel, getSupportedAttachmentTypes, supportsAttachmentType, supportsMultimodal } from '../config/models';
import { getLogger } from '../utils/logger';

export class AIProviderFactory implements ProviderFactory {
  private static instance: AIProviderFactory;
  
  static getInstance(): AIProviderFactory {
    if (!AIProviderFactory.instance) {
      AIProviderFactory.instance = new AIProviderFactory();
    }
    return AIProviderFactory.instance;
  }

  createProvider(name: ProviderName, config: ProviderConfig): AIProvider {
    const logger = getLogger();
    logger.debug('PROVIDER', 'Factory creating provider', {
      provider: name,
      has_api_key: !!config.apiKey,
      model: config.model
    });
    
    switch (name) {
      case 'google':
        logger.debug('PROVIDER', 'Creating Google provider', { provider: 'google', model: config.model });
        return new GoogleProvider(config);
      case 'openai':
        logger.debug('PROVIDER', 'Creating OpenAI provider', { provider: 'openai', model: config.model });
        return new OpenAIProvider(config);
      case 'anthropic':
        logger.debug('PROVIDER', 'Creating Anthropic provider', { provider: 'anthropic', model: config.model });
        return new AnthropicProvider(config);
      case 'openrouter':
        logger.debug('PROVIDER', 'Creating OpenRouter provider', { provider: 'openrouter', model: config.model });
        return new OpenRouterProvider(config);
      default:
        logger.error('PROVIDER', 'Unsupported provider requested', { provider: name });
        throw new Error(`Unsupported provider: ${name}`);
    }
  }

  getSupportedProviders(): ProviderName[] {
    return getAllProviders().map(p => p.name as ProviderName);
  }

  getProviderModels(providerName: ProviderName): string[] {
    return getProviderModels(providerName);
  }

  getDefaultModel(providerName: ProviderName): string {
    return getDefaultModel(providerName);
  }

  // Supported MIME types for each provider
  getSupportedAttachmentTypes(providerName: ProviderName): string[] {
    return getSupportedAttachmentTypes(providerName);
  }

  // Check if provider supports a specific attachment type
  supportsAttachmentType(providerName: ProviderName, mimeType: string): boolean {
    return supportsAttachmentType(providerName, mimeType);
  }

  // Check if provider supports multimodal content
  supportsMultimodal(providerName: ProviderName): boolean {
    return supportsMultimodal(providerName);
  }
}
