// Frontend service for querying model capabilities
// TODO: This should eventually fetch from backend API

interface ModelCapabilities {
	supportsThinking?: boolean;
	supportsSearch?: boolean;
	supportsReasoningEffort?: boolean;
	reasoningEffortLevels?: string[];
	defaultReasoningEffort?: string;
}

interface ProviderModelCapabilities {
	[modelId: string]: ModelCapabilities;
}

interface AllModelCapabilities {
	[provider: string]: ProviderModelCapabilities;
}

// Hardcoded capabilities matching backend config
// TODO: Replace with API call to backend /api/models/capabilities
const MODEL_CAPABILITIES: AllModelCapabilities = {
	google: {
		'gemini-2.5-pro-preview-06-05': {
			supportsThinking: true
		},
		'gemini-2.5-flash-preview-05-20': {
			supportsThinking: true
		},
		'gemini-2.5-flash-preview-05-20-non-thinking': {
			supportsThinking: false
		}
	},
	openai: {
		'gpt-4o': {
			supportsThinking: false
		},
		'gpt-4o-mini': {
			supportsThinking: false
		},
		'gpt-4.1': {
			supportsThinking: false
		},
		'gpt-4.1-mini': {
			supportsThinking: false
		},
		'gpt-4.1-nano': {
			supportsThinking: false
		},
		'o3-2025-04-16': {
			supportsThinking: true,
			supportsReasoningEffort: true,
			reasoningEffortLevels: ['low', 'medium', 'high'],
			defaultReasoningEffort: 'medium'
		},
		'o4-mini-2025-04-16': {
			supportsThinking: true,
			supportsReasoningEffort: true,
			reasoningEffortLevels: ['low', 'medium', 'high'],
			defaultReasoningEffort: 'medium'
		}
	},
	anthropic: {
		'claude-sonnet-4-20250514': {
			supportsThinking: true
		},
		'claude-opus-4-20250514': {
			supportsThinking: true
		},
		'claude-3-5-sonnet-20241022': {
			supportsThinking: false
		},
		'claude-3-5-haiku-20241022': {
			supportsThinking: false
		},
		'claude-3-opus-20240229': {
			supportsThinking: false
		}
	},
	openrouter: {
		'openai/o4-mini': {
			supportsThinking: false
		},
		'qwen/qwen3-32b:free': {
			supportsThinking: false
		},
		'google/gemini-2.0-flash-exp:free': {
			supportsThinking: false
		}
	}
};

export function getModelCapabilities(provider: string, modelId: string): ModelCapabilities {
	return MODEL_CAPABILITIES[provider]?.[modelId] || {};
}

export function supportsThinking(provider: string, modelId: string): boolean {
	return getModelCapabilities(provider, modelId).supportsThinking || false;
}

export function supportsSearch(provider: string, modelId: string): boolean {
	return getModelCapabilities(provider, modelId).supportsSearch || false;
}

export function supportsReasoningEffort(provider: string, modelId: string): boolean {
	return getModelCapabilities(provider, modelId).supportsReasoningEffort || false;
}

export function getReasoningEffortLevels(provider: string, modelId: string): string[] {
	return getModelCapabilities(provider, modelId).reasoningEffortLevels || [];
}

export function getDefaultReasoningEffort(provider: string, modelId: string): string | null {
	return getModelCapabilities(provider, modelId).defaultReasoningEffort || null;
}

// Helper to get all capabilities for a model
export function getAllCapabilities(provider: string, modelId: string) {
	const capabilities = getModelCapabilities(provider, modelId);
	return {
		supportsThinking: supportsThinking(provider, modelId),
		supportsSearch: supportsSearch(provider, modelId),
		supportsReasoningEffort: supportsReasoningEffort(provider, modelId),
		reasoningEffortLevels: getReasoningEffortLevels(provider, modelId),
		defaultReasoningEffort: getDefaultReasoningEffort(provider, modelId)
	};
}