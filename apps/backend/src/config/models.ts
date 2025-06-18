export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
  contextWindow?: number;
  inputPricing?: string;
  outputPricing?: string;
  // Pricing in cents per 1K tokens
  promptTokenCostPer1K?: number;
  completionTokenCostPer1K?: number;
  // Model capabilities
  supportsThinking?: boolean;
  supportsSearch?: boolean;
  supportsReasoningEffort?: boolean;
  reasoningEffortLevels?: string[];
  defaultReasoningEffort?: string;
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  models: ModelInfo[];
  defaultModel: string;
  supportedAttachmentTypes: string[];
}

export const MODELS_CONFIG: Record<string, ProviderInfo> = {
  google: {
    name: 'google',
    displayName: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash-preview-05-20',
    supportedAttachmentTypes: [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/html',
      'audio/wav', 'audio/mp3', 'audio/mpeg',
      'video/mp4', 'video/mpeg', 'video/quicktime'
    ],
    models: [
      {
        id: 'gemini-2.5-pro-preview-06-05',
        displayName: 'Gemini 2.5 Pro',
        description: 'Most capable model for complex reasoning tasks',
        contextWindow: 1000000,
        inputPricing: '$1.25 / 1M tokens (<=200k), $2.50 / 1M tokens (>200k)',
        outputPricing: '$10.00 / 1M tokens (<=200k), $15.00 / 1M tokens (>200k)',
        promptTokenCostPer1K: 0.125, // $1.25 per 1M tokens = $0.00125 per 1K = 0.125 cents per 1K
        completionTokenCostPer1K: 1.0, // $10.00 per 1M tokens = $0.010 per 1K = 1.0 cents per 1K
        supportsThinking: true
      },
      {
        id: 'gemini-2.5-flash-preview-05-20',
        displayName: 'Gemini 2.5 Flash (Thinking)',
        description: 'Fast model with advanced reasoning capabilities',
        contextWindow: 1000000,
        inputPricing: '$0.30 / 1M tokens (text/image/video), $1.00 / 1M tokens (audio)',
        outputPricing: '$2.50 / 1M tokens',
        promptTokenCostPer1K: 0.03, // $0.30 per 1M tokens = $0.0003 per 1K = 0.03 cents per 1K
        completionTokenCostPer1K: 0.25, // $2.50 per 1M tokens = $0.0025 per 1K = 0.25 cents per 1K
        supportsThinking: true
      },
      {
        id: 'gemini-2.5-flash-preview-05-20-non-thinking',
        displayName: 'Gemini 2.5 Flash (Standard)',
        description: 'Fast and cost-effective model for most tasks',
        contextWindow: 1000000,
        inputPricing: '$0.30 / 1M tokens (text/image/video), $1.00 / 1M tokens (audio)',
        outputPricing: '$2.50 / 1M tokens',
        promptTokenCostPer1K: 0.03, // $0.30 per 1M tokens = $0.0003 per 1K = 0.03 cents per 1K
        completionTokenCostPer1K: 0.25, // $2.50 per 1M tokens = $0.0025 per 1K = 0.25 cents per 1K
        supportsThinking: false
      },
      {
        id: 'gemini-2.5-flash-lite-preview-06-17',
        displayName: 'Gemini 2.5 Flash Lite',
        description: 'Lower cost model for large scale processing and high volume tasks',
        contextWindow: 1000000,
        inputPricing: '$0.10 / 1M tokens',
        outputPricing: '$0.40 / 1M tokens',
        promptTokenCostPer1K: 0.01, // $0.10 per 1M tokens = $0.0001 per 1K = 0.01 cents per 1K
        completionTokenCostPer1K: 0.04, // $0.40 per 1M tokens = $0.0004 per 1K = 0.04 cents per 1K
        supportsThinking: true
      }
    ]
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI GPT',
    defaultModel: 'gpt-4o',
    supportedAttachmentTypes: [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp'
    ],
    models: [
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        description: 'Most advanced multimodal model',
        contextWindow: 128000,
        supportsThinking: false
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        description: 'Affordable and intelligent small model',
        contextWindow: 128000,
        supportsThinking: false
      },
      {
        id: 'gpt-4.1',
        displayName: 'GPT-4.1',
        description: 'Smartest model for complex tasks',
        contextWindow: 128000,
        inputPricing: '$2.00 / 1M tokens',
        outputPricing: '$8.00 / 1M tokens',
        promptTokenCostPer1K: 0.2, // $2.00 per 1M tokens = $0.002 per 1K = 0.2 cents per 1K
        completionTokenCostPer1K: 0.8, // $8.00 per 1M tokens = $0.008 per 1K = 0.8 cents per 1K
        supportsThinking: false
      },
      {
        id: 'gpt-4.1-mini',
        displayName: 'GPT-4.1 Mini',
        description: 'Affordable model balancing speed and intelligence',
        contextWindow: 128000,
        inputPricing: '$0.40 / 1M tokens',
        outputPricing: '$1.60 / 1M tokens',
        promptTokenCostPer1K: 0.04, // $0.40 per 1M tokens = $0.0004 per 1K = 0.04 cents per 1K
        completionTokenCostPer1K: 0.16, // $1.60 per 1M tokens = $0.0016 per 1K = 0.16 cents per 1K
        supportsThinking: false
      },
      {
        id: 'gpt-4.1-nano',
        displayName: 'GPT-4.1 Nano',
        description: 'Fastest, most cost-effective model for low-latency tasks',
        contextWindow: 128000,
        inputPricing: '$0.100 / 1M tokens',
        outputPricing: '$0.400 / 1M tokens',
        promptTokenCostPer1K: 0.01, // $0.100 per 1M tokens = $0.0001 per 1K = 0.01 cents per 1K
        completionTokenCostPer1K: 0.04, // $0.400 per 1M tokens = $0.0004 per 1K = 0.04 cents per 1K
        supportsThinking: false
      },
      {
        id: 'o3-2025-04-16',
        displayName: 'OpenAI o3',
        description: 'Most powerful reasoning model with leading performance on coding, math, science, and vision',
        contextWindow: 128000,
        inputPricing: '$2.00 / 1M tokens',
        outputPricing: '$8.00 / 1M tokens',
        promptTokenCostPer1K: 0.2, // $2.00 per 1M tokens = $0.002 per 1K = 0.2 cents per 1K
        completionTokenCostPer1K: 0.8, // $8.00 per 1M tokens = $0.008 per 1K = 0.8 cents per 1K
        supportsThinking: true,
        supportsReasoningEffort: true,
        reasoningEffortLevels: ['low', 'medium', 'high'],
        defaultReasoningEffort: 'medium'
      },
      {
        id: 'o4-mini-2025-04-16',
        displayName: 'OpenAI o4-mini',
        description: 'Faster, cost-efficient reasoning model delivering strong performance on math, coding and vision',
        contextWindow: 128000,
        inputPricing: '$1.100 / 1M tokens',
        outputPricing: '$4.400 / 1M tokens',
        promptTokenCostPer1K: 0.11, // $1.100 per 1M tokens = $0.0011 per 1K = 0.11 cents per 1K
        completionTokenCostPer1K: 0.44, // $4.400 per 1M tokens = $0.0044 per 1K = 0.44 cents per 1K
        supportsThinking: true,
        supportsReasoningEffort: true,
        reasoningEffortLevels: ['low', 'medium', 'high'],
        defaultReasoningEffort: 'medium'
      },
    ]
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-20250514',
    supportedAttachmentTypes: [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/html'
    ],
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        description: 'Latest generation Sonnet model',
        contextWindow: 200000,
        inputPricing: '$3.00 / 1M tokens',
        outputPricing: '$15.00 / 1M tokens',
        promptTokenCostPer1K: 0.3, // $3.00 per 1M tokens = $0.003 per 1K = 0.3 cents per 1K
        completionTokenCostPer1K: 1.5, // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
        supportsThinking: true
      },
      {
        id: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        description: 'Most powerful Claude model for complex tasks',
        contextWindow: 200000,
        inputPricing: '$15.00 / 1M tokens',
        outputPricing: '$75.00 / 1M tokens',
        promptTokenCostPer1K: 1.5, // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
        completionTokenCostPer1K: 7.5, // $75.00 per 1M tokens = $0.075 per 1K = 7.5 cents per 1K
        supportsThinking: true
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        description: 'Balanced model for most tasks',
        contextWindow: 200000,
        inputPricing: '$3.00 / 1M tokens',
        outputPricing: '$15.00 / 1M tokens',
        promptTokenCostPer1K: 0.3, // $3.00 per 1M tokens = $0.003 per 1K = 0.3 cents per 1K
        completionTokenCostPer1K: 1.5, // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
        supportsThinking: false
      },
      {
        id: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        description: 'Fast and efficient model',
        contextWindow: 200000,
        inputPricing: '$0.80 / MTok',
        outputPricing: '$4.00 / MTok',
        promptTokenCostPer1K: 0.08, // $0.80 per 1M tokens = $0.0008 per 1K = 0.08 cents per 1K
        completionTokenCostPer1K: 0.4, // $4.00 per 1M tokens = $0.004 per 1K = 0.4 cents per 1K
        supportsThinking: false
      },
      {
        id: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        description: 'Previous generation flagship model',
        contextWindow: 200000,
        inputPricing: '$15.00 / 1M tokens',
        outputPricing: '$75.00 / 1M tokens',
        promptTokenCostPer1K: 1.5, // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
        completionTokenCostPer1K: 7.5, // $75.00 per 1M tokens = $0.075 per 1K = 7.5 cents per 1K
        supportsThinking: false
      }
    ]
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    defaultModel: 'gpt-4o',
    supportedAttachmentTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    models: [
      {
        id: 'openai/o4-mini',
        displayName: 'OpenRouter GPT-4o Mini',
        description: 'Affordable and intelligent small model',
        contextWindow: 128000,
        inputPricing: '$1.100 / 1M tokens',
        outputPricing: '$4.400 / 1M tokens',
        promptTokenCostPer1K: 0.11, // $1.100 per 1M tokens = $0.0011 per 1K = 0.11 cents per 1K
        completionTokenCostPer1K: 0.44, // $4.400 per 1M tokens = $0.0044 per 1K = 0.44 cents per 1K
        supportsThinking: false
      },
      {
        id: 'qwen/qwen3-32b:free',
        displayName: 'OpenRouter Qwen 32B',
        description: 'Large model with advanced capabilities',
        contextWindow: 200000,
        inputPricing: '$0.002 / 1M tokens',
        outputPricing: '$0.002 / 1M tokens',
        promptTokenCostPer1K: 0.002, // $0.002 per 1M tokens = $0.0002 per 1K = 0.002 cents per 1K
        completionTokenCostPer1K: 0.002, // $0.002 per 1M tokens = $0.0002 per 1K = 0.002 cents per 1K
        supportsThinking: false
      },
      {
        id: 'google/gemini-2.0-flash-exp:free',
        displayName: 'OpenRouter Gemini 2.0 Flash',
        description: 'Large model with advanced capabilities',
        contextWindow: 200000,
        inputPricing: '$0.002 / 1M tokens',
        outputPricing: '$0.002 / 1M tokens',
        promptTokenCostPer1K: 0.002, // $0.002 per 1M tokens = $0.0002 per 1K = 0.002 cents per 1K
        completionTokenCostPer1K: 0.002, // $0.002 per 1M tokens = $0.0002 per 1K = 0.002 cents per 1K
        supportsThinking: false
      },
      ]
  }
};

// Helper functions for easy access
export function getAllProviders(): ProviderInfo[] {
  return Object.values(MODELS_CONFIG);
}

export function getProvider(name: string): ProviderInfo | undefined {
  return MODELS_CONFIG[name];
}

export function getProviderModels(providerName: string): string[] {
  const provider = getProvider(providerName);
  return provider ? provider.models.map(m => m.id) : [];
}

export function getDefaultModel(providerName: string): string {
  const provider = getProvider(providerName);
  return provider?.defaultModel || '';
}

export function getModelDisplayName(providerName: string, modelId: string): string {
  const provider = getProvider(providerName);
  const model = provider?.models.find(m => m.id === modelId);
  return model?.displayName || modelId;
}

export function getSupportedAttachmentTypes(providerName: string): string[] {
  const provider = getProvider(providerName);
  return provider?.supportedAttachmentTypes || [];
}

export function supportsAttachmentType(providerName: string, mimeType: string): boolean {
  const supportedTypes = getSupportedAttachmentTypes(providerName);
  return supportedTypes.includes(mimeType);
}

export function supportsMultimodal(providerName: string): boolean {
  return getSupportedAttachmentTypes(providerName).length > 0;
}

// Convert to the format expected by the frontend provider service
export interface AIProvider {
  name: string;
  displayName: string;
  models: string[];
  defaultModel: string;
}

export function getProvidersForService(): AIProvider[] {
  return getAllProviders().map((provider) => ({
    name: provider.name,
    displayName: provider.displayName,
    models: provider.models.map((m) => m.id),
    defaultModel: provider.defaultModel
  }));
}

// Get pricing for a specific model
export interface ModelPricing {
  promptTokenCostPer1K: number;
  completionTokenCostPer1K: number;
}

export function getModelPricing(modelId: string): ModelPricing | null {
  for (const provider of getAllProviders()) {
    const model = provider.models.find(m => m.id === modelId);
    if (model && model.promptTokenCostPer1K !== undefined && model.completionTokenCostPer1K !== undefined) {
      return {
        promptTokenCostPer1K: model.promptTokenCostPer1K,
        completionTokenCostPer1K: model.completionTokenCostPer1K
      };
    }
  }
  return null;
}

// Helper functions for model capabilities
export function getModelInfo(modelId: string): ModelInfo | null {
  for (const provider of getAllProviders()) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return model;
    }
  }
  return null;
}

export function supportsThinking(modelId: string): boolean {
  const model = getModelInfo(modelId);
  return model?.supportsThinking || false;
}

export function supportsSearch(modelId: string): boolean {
  const model = getModelInfo(modelId);
  return model?.supportsSearch || false;
}

export function supportsReasoningEffort(modelId: string): boolean {
  const model = getModelInfo(modelId);
  return model?.supportsReasoningEffort || false;
}

export function getReasoningEffortLevels(modelId: string): string[] {
  const model = getModelInfo(modelId);
  return model?.reasoningEffortLevels || [];
}

export function getDefaultReasoningEffort(modelId: string): string | null {
  const model = getModelInfo(modelId);
  return model?.defaultReasoningEffort || null;
}
