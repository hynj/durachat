import { RpcTarget } from "cloudflare:workers";
import { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { eq } from "drizzle-orm";
import { userSettings, UserSettings as UserSettingsType } from "../../db/user/data";
import { encryptApiKeys, decryptApiKeys, migrateApiKeysToEncrypted } from "../../utils/encryption";
import { getLogger } from "../../utils/logger";
import * as v from 'valibot';

// Validation schemas
const UpdateSettingsSchema = v.object({
  apiKeys: v.optional(v.record(v.string(), v.string())),
  preferences: v.optional(v.object({
    defaultModel: v.optional(v.string()),
    defaultProvider: v.optional(v.string()),
    theme: v.optional(v.string())
  }))
});

export interface ConsolidatedUserSettings {
  balanceInOneHundreths: number;
  credits: number; // Derived from balanceInOneHundreths for frontend compatibility
  encryptedApiKeys?: Record<string, any>;
  apiKeys?: Record<string, string>; // Decrypted API keys for display
  preferences: {
    defaultModel?: string;
    defaultProvider?: string;
    theme?: string;
    [key: string]: any;
  };
}

export class UserSettings extends RpcTarget {
  private userId: string;

  constructor(
    private db: DrizzleSqliteDODatabase<any>,
    private ctx: DurableObjectState,
    private storage: DurableObjectStorage,
    private env: CloudflareBindings,
    userId: string
  ) {
    super();
    this.userId = userId;
  }

  /**
   * Get consolidated user settings including decrypted API keys
   */
  async getCurrentSettings(): Promise<ConsolidatedUserSettings> {
    const logger = getLogger(this.env);
    
    try {
      const settings = await this.db.select().from(userSettings).limit(1);
      
      if (settings.length === 0) {
        // Initialize with defaults if no settings exist
        await this.initializeSettings();
        return this.getCurrentSettings();
      }

      const setting = settings[0];
      
      logger.debug('USER_SETTINGS', 'Raw setting from database', {
        userId: this.userId,
        hasEncryptedKeys: !!setting.encryptedApiKeys
      });
      
      // Decrypt API keys if they exist and we have the master key
      let decryptedApiKeys: Record<string, string> = {};
      
      if (setting.encryptedApiKeys && this.env.ENCRYPTION_MASTER_KEY) {
        try {
          logger.debug('USER_SETTINGS', 'Attempting to decrypt API keys', {
            userId: this.userId,
            hasEncryptionKey: !!this.env.ENCRYPTION_MASTER_KEY,
            encryptedKeysCount: Object.keys(setting.encryptedApiKeys).length
          });
          
          decryptedApiKeys = await decryptApiKeys(
            setting.encryptedApiKeys,
            this.userId,
            this.env.ENCRYPTION_MASTER_KEY
          );
          
          logger.debug('USER_SETTINGS', 'Successfully decrypted API keys', {
            userId: this.userId,
            decryptedKeysCount: Object.keys(decryptedApiKeys).length
          });
        } catch (error) {
          logger.error('USER_SETTINGS', 'Failed to decrypt API keys', {
            userId: this.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          // Clear the corrupted encrypted keys from the database
          logger.warn('USER_SETTINGS', 'Clearing corrupted encrypted API keys from database', {
            userId: this.userId
          });
          
          try {
            await this.db
              .update(userSettings)
              .set({
                encryptedApiKeys: null,
                updatedAt: new Date()
              })
              .where(eq(userSettings.id, "user_settings"));
            
            logger.info('USER_SETTINGS', 'Corrupted encrypted keys cleared from database', {
              userId: this.userId
            });
          } catch (clearError) {
            logger.error('USER_SETTINGS', 'Failed to clear corrupted encrypted keys', {
              userId: this.userId,
              error: clearError instanceof Error ? clearError.message : 'Unknown error'
            });
          }
          
          decryptedApiKeys = {};
        }
      } else {
        logger.debug('USER_SETTINGS', 'No encrypted keys or encryption key not available', {
          userId: this.userId,
          hasEncryptedKeys: !!setting.encryptedApiKeys,
          hasEncryptionKey: !!this.env.ENCRYPTION_MASTER_KEY
        });
      }

      return {
        balanceInOneHundreths: setting.balanceInOneHundreths || 0,
        credits: setting.balanceInOneHundreths || 0, // Frontend expects this field
        encryptedApiKeys: setting.encryptedApiKeys,
        apiKeys: decryptedApiKeys, // Show decrypted keys for frontend display
        preferences: setting.preferences || {
          defaultModel: "gemini-2.5-flash-preview-05-20",
          defaultProvider: "google",
          theme: "light"
        }
      };
    } catch (error) {
      logger.error('USER_SETTINGS', 'Failed to get current settings', {
        userId: this.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to retrieve user settings');
    }
  }

  /**
   * Update user settings with validation and encryption
   */
  async updateSettings(updates: v.InferInput<typeof UpdateSettingsSchema>): Promise<void> {
    const logger = getLogger(this.env);
    
    try {
      logger.debug('USER_SETTINGS', 'Validating updates', {
        userId: this.userId,
        hasApiKeys: !!updates.apiKeys,
        hasPreferences: !!updates.preferences
      });
      
      // Validate input
      const validatedUpdates = v.parse(UpdateSettingsSchema, updates);
      
      // Get current settings to merge with updates
      const currentSettings = await this.db.select().from(userSettings).limit(1);
      
      if (currentSettings.length === 0) {
        await this.initializeSettings();
      }

      const updateData: Partial<UserSettingsType> = {};

      // Handle API keys encryption
      if (validatedUpdates.apiKeys && this.env.ENCRYPTION_MASTER_KEY) {
        try {
          // Filter out empty keys and placeholder values
          const filteredKeys = Object.fromEntries(
            Object.entries(validatedUpdates.apiKeys).filter(([_, value]) => 
              value && value.trim() !== '' && value !== '••••••••••••••••'
            )
          );

          if (Object.keys(filteredKeys).length > 0) {
            const encryptedKeys = await encryptApiKeys(
              filteredKeys,
              this.userId,
              this.env.ENCRYPTION_MASTER_KEY
            );
            
            // Merge with existing encrypted keys
            const existing = currentSettings[0]?.encryptedApiKeys || {};
            updateData.encryptedApiKeys = { ...existing, ...encryptedKeys };
          }
        } catch (error) {
          logger.error('USER_SETTINGS', 'Failed to encrypt API keys', {
            userId: this.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw new Error('Failed to encrypt API keys');
        }
      }

      // Update preferences
      if (validatedUpdates.preferences) {
        const currentPreferences = currentSettings[0]?.preferences || {};
        updateData.preferences = { ...currentPreferences, ...validatedUpdates.preferences };
      }

      // Perform the update
      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date();
        
        await this.db
          .update(userSettings)
          .set(updateData)
          .where(eq(userSettings.id, "user_settings"));
        
        logger.info('USER_SETTINGS', 'Settings updated successfully', {
          userId: this.userId,
          updatedFields: Object.keys(updateData)
        });
      }
    } catch (error) {
      logger.error('USER_SETTINGS', 'Failed to update settings', {
        userId: this.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Initialize settings with default values
   */
  async initializeSettings(): Promise<void> {
    const logger = getLogger(this.env);
    
    try {
      await this.db.insert(userSettings).values({
        id: "user_settings",
        balanceInOneHundreths: 5000, // £50 default
        preferences: {
          defaultModel: "gemini-2.5-flash-preview-05-20",
          defaultProvider: "google",
          theme: "light"
        }
      });
      
      logger.info('USER_SETTINGS', 'User settings initialized', {
        userId: this.userId
      });
    } catch (error) {
      logger.error('USER_SETTINGS', 'Failed to initialize settings', {
        userId: this.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Failed to initialize user settings');
    }
  }


  /**
   * Update balance only
   */
  async updateBalance(balanceInOneHundreths: number): Promise<void> {
    await this.db.update(userSettings).set({
      balanceInOneHundreths: balanceInOneHundreths
    })
  }


  /**
   * Get decrypted API key for a specific provider
   */
  async getApiKeyForProvider(provider: string): Promise<string | null> {
    const logger = getLogger(this.env);
    
    try {
      const settings = await this.getCurrentSettings();
      
      // Check decrypted API keys
      if (settings.apiKeys && settings.apiKeys[provider]) {
        return settings.apiKeys[provider];
      }
      
      return null;
    } catch (error) {
      logger.error('USER_SETTINGS', 'Failed to get API key for provider', {
        userId: this.userId,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
}


