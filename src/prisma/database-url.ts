import { Logger } from '@nestjs/common';
import { getSecret } from '../utils/secrets';

const logger = new Logger('DatabaseUrl');

/**
 * Build the PostgreSQL DATABASE_URL from individual secrets or use direct URL.
 *
 * Supports Docker secrets via _FILE suffix for all components:
 * - DATABASE_URL / DATABASE_URL_FILE - Direct connection string (takes precedence)
 * - POSTGRES_USER / POSTGRES_USER_FILE - Database username
 * - POSTGRES_PASSWORD / POSTGRES_PASSWORD_FILE - Database password
 * - POSTGRES_DB / POSTGRES_DB_FILE - Database name
 * - POSTGRES_HOST - Database host (default: 'postgres')
 * - POSTGRES_PORT - Database port (default: '5432')
 *
 * @returns PostgreSQL connection URL
 * @throws Error if neither DATABASE_URL nor POSTGRES_PASSWORD is provided
 *
 * @example
 * // Using direct URL
 * DATABASE_URL=postgresql://user:pass@host:5432/db
 *
 * @example
 * // Using Docker secrets
 * POSTGRES_USER_FILE=/run/secrets/postgres_user
 * POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
 * POSTGRES_DB_FILE=/run/secrets/postgres_db
 * POSTGRES_HOST=10.1.125.55
 * POSTGRES_PORT=5000
 */
export function getDatabaseUrl(): string {
  // Direct URL takes precedence (supports _FILE suffix)
  const directUrl = getSecret('DATABASE_URL');
  if (directUrl) {
    logger.log('Using DATABASE_URL directly');
    return directUrl;
  }

  // Build from individual components
  const user = getSecret('POSTGRES_USER', 'excalidraw');
  const password = getSecret('POSTGRES_PASSWORD');
  const host = getSecret('POSTGRES_HOST', 'postgres');
  const port = getSecret('POSTGRES_PORT', '5432');
  const db = getSecret('POSTGRES_DB', 'excalidraw');

  if (!password) {
    throw new Error(
      'Database password is required. ' +
        'Set POSTGRES_PASSWORD, POSTGRES_PASSWORD_FILE, DATABASE_URL, or DATABASE_URL_FILE.',
    );
  }

  // URL-encode the password to handle special characters
  const encodedPassword = encodeURIComponent(password);
  const url = `postgresql://${user}:${encodedPassword}@${host}:${port}/${db}?schema=public`;

  logger.log(`Connecting to PostgreSQL at ${host}:${port}/${db}`);
  return url;
}
