import type { ProviderName } from './types';
import { getModelPricing, type ModelPricing } from '../config/models';

// Legacy pricing data for models not yet in the unified config
const LEGACY_MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic pricing (legacy - should be moved to models config)
  'claude-sonnet-4-20250514': {
    promptTokenCostPer1K: 0.3, // $3.00 per 1M tokens = $0.003 per 1K = 0.3 cents per 1K
    completionTokenCostPer1K: 1.5 // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
  },
  'claude-3-5-sonnet-20241022': {
    promptTokenCostPer1K: 0.3, // $3.00 per 1M tokens = $0.003 per 1K = 0.3 cents per 1K
    completionTokenCostPer1K: 1.5 // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
  },
  'claude-3-opus-20240229': {
    promptTokenCostPer1K: 1.5, // $15.00 per 1M tokens = $0.015 per 1K = 1.5 cents per 1K
    completionTokenCostPer1K: 7.5 // $75.00 per 1M tokens = $0.075 per 1K = 7.5 cents per 1K
  },
  
  // OpenAI pricing (legacy)
  'gpt-4': {
    promptTokenCostPer1K: 3.0, // $30.00 per 1M tokens = $0.03 per 1K = 3.0 cents per 1K
    completionTokenCostPer1K: 6.0 // $60.00 per 1M tokens = $0.06 per 1K = 6.0 cents per 1K
  },
  'gpt-4o': {
    promptTokenCostPer1K: 0.25, // $2.50 per 1M tokens = $0.0025 per 1K = 0.25 cents per 1K
    completionTokenCostPer1K: 1.0 // $10.00 per 1M tokens = $0.01 per 1K = 1.0 cents per 1K
  },
  'gpt-4o-mini': {
    promptTokenCostPer1K: 0.015, // $0.15 per 1M tokens = $0.00015 per 1K = 0.015 cents per 1K
    completionTokenCostPer1K: 0.06 // $0.60 per 1M tokens = $0.0006 per 1K = 0.06 cents per 1K
  },
  
  // Google pricing (per 1M tokens from official pricing)
  'gemini-2.5-flash-preview-05-20': {
    promptTokenCostPer1K: 0.015, // $0.15 per 1M tokens = $0.00015 per 1K = 0.015 cents per 1K
    completionTokenCostPer1K: 0.35 // $3.50 per 1M tokens (thinking output) = $0.0035 per 1K = 0.35 cents per 1K
  },
  'gemini-2.5-flash-preview-05-20-non-thinking': {
    promptTokenCostPer1K: 0.015, // $0.15 per 1M tokens = $0.00015 per 1K = 0.015 cents per 1K
    completionTokenCostPer1K: 0.06 // $0.60 per 1M tokens (non-thinking output) = $0.0006 per 1K = 0.06 cents per 1K
  },
  'gemini-2.5-pro-preview-06-05': {
    promptTokenCostPer1K: 0.125, // $1.25 per 1M tokens = $0.00125 per 1K = 0.125 cents per 1K (using lower tier)
    completionTokenCostPer1K: 1.0 // $10.00 per 1M tokens = $0.01 per 1K = 1.0 cents per 1K
  },
  'gemini-pro': {
    promptTokenCostPer1K: 0.05, // $0.50 per 1M tokens = $0.0005 per 1K = 0.05 cents per 1K
    completionTokenCostPer1K: 0.15 // $1.50 per 1M tokens = $0.0015 per 1K = 0.15 cents per 1K
  }
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Try to get pricing from the unified config first
  let pricing = getModelPricing(model);
  
  // Fall back to legacy pricing
  if (!pricing) {
    pricing = LEGACY_MODEL_PRICING[model];
  }
  
  if (!pricing) {
    // Default pricing if model not found
    return Math.round((promptTokens * 0.1 + completionTokens * 0.2) / 10); // Default rough estimate in cents
  }
  
  const promptCost = (promptTokens / 1000) * pricing.promptTokenCostPer1K;
  const completionCost = (completionTokens / 1000) * pricing.completionTokenCostPer1K;
  
  return Math.round(promptCost + completionCost); // Return cost in cents
}

/**
 * Get per-token pricing for a provider and model
 * Returns cost per individual token (not per 1K tokens)
 */
export function getProviderCostPerToken(
  provider: ProviderName,
  model: string
): {
  promptTokenCost: number;
  completionTokenCost: number;
  provider: ProviderName;
  model: string;
} {
  // Try to get pricing from the unified config first
  let pricing = getModelPricing(model);
  
  // Fall back to legacy pricing
  if (!pricing) {
    pricing = LEGACY_MODEL_PRICING[model];
  }
  
  if (!pricing) {
    // Default pricing if model not found - very rough estimates
    const defaultPricing = {
      promptTokenCostPer1K: 100, // $1.00 per 1K tokens
      completionTokenCostPer1K: 200 // $2.00 per 1K tokens
    };
    
    return {
      promptTokenCost: defaultPricing.promptTokenCostPer1K / 1000 / 100, // Convert to cost per token in dollars
      completionTokenCost: defaultPricing.completionTokenCostPer1K / 1000 / 100,
      provider,
      model
    };
  }
  
  return {
    promptTokenCost: pricing.promptTokenCostPer1K / 1000 / 100, // Convert from cents per 1K to dollars per token
    completionTokenCost: pricing.completionTokenCostPer1K / 1000 / 100,
    provider,
    model
  };
}