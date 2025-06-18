import {
	getProvidersForService,
	getModelDisplayName as getModelDisplayNameFromConfig
} from 'backend/src/config/models';
import { client } from '$lib/rpc/hono';

export interface AIModel {
	name: string;
	displayName?: string;
}

export interface AIProvider {
	name: string;
	displayName: string;
	models: string[];
	defaultModel: string;
}

export interface ProvidersResponse {
	providers: AIProvider[];
}

export interface SwitchProviderRequest {
	conversationId: string;
	provider: string;
	model: string;
}

export interface SwitchProviderResponse {
	success: boolean;
	message: string;
}

class ProviderService {
	async getProviders(): Promise<AIProvider[]> {
		// Return static configuration instead of making an API request
		return getProvidersForService();
	}

	async switchProvider(conversationId: string | null | undefined, provider: string, model: string): Promise<void> {
		// If no conversation ID, this is a new conversation - skip backend call
		if (!conversationId) {
			console.log('🔄 Provider switch for new conversation - will use when creating conversation');
			return Promise.resolve();
		}

		try {
			const response = await client.test['switch-provider'].$post({
				json: {
					conversationId,
					provider,
					model
				} as SwitchProviderRequest
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: response.statusText }));
				throw new Error(errorData.error || `Failed to switch provider: ${response.statusText}`);
			}

			const data: SwitchProviderResponse = await response.json();
			if (!data.success) {
				throw new Error(data.message || 'Failed to switch provider');
			}
		} catch (error) {
			console.error('Error switching provider:', error);
			throw error;
		}
	}

	getModelDisplayName(provider: string, model: string): string {
		return getModelDisplayNameFromConfig(provider, model);
	}
}

export const providerService = new ProviderService();
