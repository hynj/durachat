import { ProviderName } from '../../providers';
import { getLogger } from '../../utils/logger';
import { User } from '../../db/control/auth';
import { UserSettings } from '../../db/user/data';
import { decryptApiKeys } from '../../utils/encryption';

export interface KeyResolutionResult {
  apiKey: string;
  isUserKey: boolean;
  remainingCredits?: number;
}

/**
 * Get API key for provider - tries user keys first, then falls back to system keys
 * Simplified approach: no usage model selection, just prioritize user keys
 */
export async function getApiKeyForProvider(
  env: CloudflareBindings,
  providerName: ProviderName,
  user?: User,
  userSettings?: UserSettings
): Promise<KeyResolutionResult> {
  const logger = getLogger(env);
  
  logger.debug('PROVIDER', 'Resolving API key', {
    provider: providerName,
    userId: user?.id,
    hasUserSettings: !!userSettings,
    hasUserApiKeys: !!userSettings?.encryptedApiKeys,
    userCredits: user?.credits
  });

  // First, try to use user's own API keys if available
  if (user && userSettings && userSettings.encryptedApiKeys) {
    try {
      const masterKey = env.ENCRYPTION_MASTER_KEY;
      if (!masterKey) {
        logger.warn('PROVIDER', 'ENCRYPTION_MASTER_KEY not configured, falling back to system keys');
      } else {
        const decryptedKeys = await decryptApiKeys(userSettings.encryptedApiKeys, user.id, masterKey);
        const userApiKey = decryptedKeys[providerName];
        
        if (userApiKey) {
          logger.debug('PROVIDER', 'Using user API key', {
            provider: providerName,
            userId: user.id
          });
          
          return {
            apiKey: userApiKey,
            isUserKey: true
          };
        }
      }
    } catch (error) {
      logger.warn('PROVIDER', 'Failed to decrypt user API keys, falling back to system keys', {
        provider: providerName,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Fall back to system keys (credit-based usage)
  const systemApiKey = getSystemApiKey(env, providerName);
  
  if (user) {
    // Check if user has sufficient credits (basic check, detailed validation happens during usage)
    if (user.credits <= 0) {
      throw new Error('No API key configured and insufficient credits. Please add your API key or top up your account.');
    }
    
    logger.debug('PROVIDER', 'Using system API key with user credits', {
      provider: providerName,
      userId: user.id,
      remainingCredits: user.credits
    });
    
    return {
      apiKey: systemApiKey,
      isUserKey: false,
      remainingCredits: user.credits
    };
  }

  // Default system key for non-authenticated usage
  logger.debug('PROVIDER', 'Using system API key (no user)', {
    provider: providerName
  });
  
  return {
    apiKey: systemApiKey,
    isUserKey: false
  };
}

/**
 * Get system API key for provider (legacy function preserved for compatibility)
 */
export function getSystemApiKey(env: CloudflareBindings, providerName: ProviderName): string {
  const logger = getLogger(env);
  
  logger.debug('PROVIDER', 'Getting system API key for provider', {
    provider: providerName,
    available_keys: {
      has_google_key: !!env.GOOGLE_API_KEY,
      has_openai_key: !!env.OPENAI_API_KEY,
      has_anthropic_key: !!env.ANTHROPIC_API_KEY,
      has_openrouter_key: !!env.OPEN_ROUTER_API_KEY
    }
  });

  switch (providerName) {
    case 'google':
      if (!env.GOOGLE_API_KEY) {
        throw new Error('GOOGLE_API_KEY not configured');
      }
      return env.GOOGLE_API_KEY;
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      return env.OPENAI_API_KEY;
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
      }
      return env.ANTHROPIC_API_KEY;
    case 'openrouter':
      if (!env.OPEN_ROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY not configured');
      }
      return env.OPEN_ROUTER_API_KEY;
    default:
      throw new Error(`No API key configured for provider: ${providerName}`);
  }
}

// Legacy function for backward compatibility
export function getApiKeyForProviderLegacy(env: CloudflareBindings, providerName: ProviderName): string {
  return getSystemApiKey(env, providerName);
}
