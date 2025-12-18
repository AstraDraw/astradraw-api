import { readFileSync, existsSync } from 'fs';
import { Logger } from '@nestjs/common';

const logger = new Logger('Secrets');

/**
 * Gets an environment variable value, supporting Docker secrets via _FILE suffix.
 * 
 * For any env var NAME, this function will:
 * 1. First check if NAME_FILE exists and points to a readable file
 * 2. If so, read and return the file contents (trimmed)
 * 3. Otherwise, return the value of NAME
 * 4. If neither exists, return the default value
 * 
 * @param name - The base environment variable name (without _FILE suffix)
 * @param defaultValue - Optional default value if neither env var nor file exists
 * @returns The secret value
 * 
 * @example
 * // If STORAGE_URI_FILE=/run/secrets/storage_uri exists, reads from that file
 * // Otherwise uses STORAGE_URI env var directly
 * const uri = getSecret('STORAGE_URI');
 * 
 * @example
 * // With default value
 * const port = getSecret('PORT', '8080');
 */
export function getSecret(name: string, defaultValue?: string): string | undefined {
  const fileEnvVar = `${name}_FILE`;
  const filePath = process.env[fileEnvVar];

  if (filePath) {
    if (existsSync(filePath)) {
      try {
        const secret = readFileSync(filePath, 'utf8').trim();
        logger.log(`Loaded ${name} from file (${fileEnvVar})`);
        return secret;
      } catch (error) {
        logger.error(`Failed to read secret from ${filePath}: ${error.message}`);
      }
    } else {
      logger.warn(`${fileEnvVar} is set to ${filePath} but file does not exist`);
    }
  }

  const value = process.env[name];
  if (value !== undefined) {
    return value;
  }

  return defaultValue;
}

/**
 * Same as getSecret but throws if the secret is not found
 */
export function getSecretOrThrow(name: string): string {
  const value = getSecret(name);
  if (value === undefined) {
    throw new Error(
      `Required secret ${name} is not set. ` +
      `Set ${name} env var or ${name}_FILE pointing to a secret file.`
    );
  }
  return value;
}

