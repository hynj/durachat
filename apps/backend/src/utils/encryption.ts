import { getLogger } from './logger';

/**
 * AES-256-GCM encryption utilities for secure API key storage
 * Uses Web Crypto API available in Cloudflare Workers
 */

// Encryption configuration
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // 256-bit key
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

export interface EncryptedData {
  encryptedData: string; // Base64 encoded
  iv: string; // Base64 encoded
  tag: string; // Base64 encoded (authentication tag)
}

/**
 * Derive encryption key from master key and user-specific salt
 */
async function deriveKey(masterKey: string, userId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = encoder.encode(`durachat_${userId}_salt`);
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt API keys for a specific user
 */
export async function encryptApiKeys(
  apiKeys: Record<string, string>,
  userId: string,
  masterKey: string
): Promise<Record<string, EncryptedData>> {
  const logger = getLogger();
  
  try {
    const encryptionKey = await deriveKey(masterKey, userId);
    const encryptedKeys: Record<string, EncryptedData> = {};

    for (const [provider, apiKey] of Object.entries(apiKeys)) {
      if (!apiKey || apiKey.trim() === '') {
        continue; // Skip empty keys
      }

      // Generate random IV for each encryption
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const encoder = new TextEncoder();
      const data = encoder.encode(apiKey);

      // Encrypt the API key
      const encrypted = await crypto.subtle.encrypt(
        {
          name: ALGORITHM,
          iv: iv,
          tagLength: TAG_LENGTH * 8, // tagLength is in bits
        },
        encryptionKey,
        data
      );

      // Split encrypted data and authentication tag
      const encryptedArray = new Uint8Array(encrypted);
      const encryptedData = encryptedArray.slice(0, -TAG_LENGTH);
      const tag = encryptedArray.slice(-TAG_LENGTH);

      encryptedKeys[provider] = {
        encryptedData: btoa(String.fromCharCode(...encryptedData)),
        iv: btoa(String.fromCharCode(...iv)),
        tag: btoa(String.fromCharCode(...tag)),
      };

      logger.debug('ENCRYPTION', 'API key encrypted', {
        provider,
        userId,
        hasKey: true
      });
    }

    return encryptedKeys;
  } catch (error) {
    logger.error('ENCRYPTION', 'Failed to encrypt API keys', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to encrypt API keys');
  }
}

/**
 * Decrypt API keys for a specific user
 */
export async function decryptApiKeys(
  encryptedKeys: Record<string, EncryptedData>,
  userId: string,
  masterKey: string
): Promise<Record<string, string>> {
  const logger = getLogger();
  
  try {
    const encryptionKey = await deriveKey(masterKey, userId);
    const decryptedKeys: Record<string, string> = {};

    for (const [provider, encryptedData] of Object.entries(encryptedKeys)) {
      try {
        // Decode base64 data
        const iv = new Uint8Array(
          atob(encryptedData.iv).split('').map(c => c.charCodeAt(0))
        );
        const encrypted = new Uint8Array(
          atob(encryptedData.encryptedData).split('').map(c => c.charCodeAt(0))
        );
        const tag = new Uint8Array(
          atob(encryptedData.tag).split('').map(c => c.charCodeAt(0))
        );

        // Combine encrypted data and tag for decryption
        const encryptedWithTag = new Uint8Array(encrypted.length + tag.length);
        encryptedWithTag.set(encrypted);
        encryptedWithTag.set(tag, encrypted.length);

        // Decrypt the API key
        const decrypted = await crypto.subtle.decrypt(
          {
            name: ALGORITHM,
            iv: iv,
            tagLength: TAG_LENGTH * 8,
          },
          encryptionKey,
          encryptedWithTag
        );

        const decoder = new TextDecoder();
        decryptedKeys[provider] = decoder.decode(decrypted);

        logger.debug('ENCRYPTION', 'API key decrypted', {
          provider,
          userId,
          hasKey: true
        });
      } catch (error) {
        logger.error('ENCRYPTION', 'Failed to decrypt API key for provider', {
          provider,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other keys even if one fails
      }
    }

    return decryptedKeys;
  } catch (error) {
    logger.error('ENCRYPTION', 'Failed to decrypt API keys', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Failed to decrypt API keys');
  }
}

/**
 * Encrypt a single API key
 */
export async function encryptSingleApiKey(
  apiKey: string,
  userId: string,
  masterKey: string
): Promise<EncryptedData> {
  const result = await encryptApiKeys({ temp: apiKey }, userId, masterKey);
  return result.temp;
}

/**
 * Decrypt a single API key
 */
export async function decryptSingleApiKey(
  encryptedData: EncryptedData,
  userId: string,
  masterKey: string
): Promise<string> {
  const result = await decryptApiKeys({ temp: encryptedData }, userId, masterKey);
  return result.temp;
}

/**
 * Migrate plain text API keys to encrypted format
 */
export async function migrateApiKeysToEncrypted(
  plainApiKeys: Record<string, string>,
  userId: string,
  masterKey: string
): Promise<Record<string, EncryptedData>> {
  const logger = getLogger();
  
  logger.info('ENCRYPTION', 'Migrating API keys to encrypted format', {
    userId,
    keyCount: Object.keys(plainApiKeys).length
  });

  const encryptedKeys = await encryptApiKeys(plainApiKeys, userId, masterKey);
  
  logger.info('ENCRYPTION', 'API keys migration completed', {
    userId,
    encryptedKeyCount: Object.keys(encryptedKeys).length
  });

  return encryptedKeys;
}

/**
 * Validate that encryption/decryption works correctly
 */
export async function validateEncryption(
  userId: string,
  masterKey: string
): Promise<boolean> {
  const logger = getLogger();
  
  try {
    const testData = { test: 'test-api-key-12345' };
    const encrypted = await encryptApiKeys(testData, userId, masterKey);
    const decrypted = await decryptApiKeys(encrypted, userId, masterKey);
    
    const isValid = decrypted.test === testData.test;
    
    logger.debug('ENCRYPTION', 'Encryption validation', {
      userId,
      isValid
    });
    
    return isValid;
  } catch (error) {
    logger.error('ENCRYPTION', 'Encryption validation failed', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}
