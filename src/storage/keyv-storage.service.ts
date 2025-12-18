import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Keyv from 'keyv';
import { getSecret } from '../utils/secrets';
import { IStorageService, StorageNamespace } from './storage.interface';

/**
 * Keyv-based storage service implementation.
 * Supports PostgreSQL, MongoDB, Redis, MySQL, SQLite, and in-memory storage.
 *
 * Configuration via environment variables:
 * - STORAGE_URI: Keyv connection string (e.g., postgres://user:pass@host:5432/db)
 * - STORAGE_URI_FILE: Path to file containing STORAGE_URI (for Docker secrets)
 */
@Injectable()
export class KeyvStorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(KeyvStorageService.name);
  private storagesMap = new Map<StorageNamespace, Keyv>();

  async onModuleInit() {
    // Support reading STORAGE_URI from file via STORAGE_URI_FILE env var
    const uri = getSecret('STORAGE_URI');
    if (!uri) {
      this.logger.warn(
        `STORAGE_URI is undefined, will use non-persistent in-memory storage`,
      );
    } else {
      this.logger.log(`Initializing Keyv storage`);
    }

    // Initialize Keyv instance for each namespace
    for (const namespace of Object.values(StorageNamespace)) {
      const keyv = new Keyv({
        uri,
        namespace,
      });
      keyv.on('error', (err) =>
        this.logger.error(`Connection Error for namespace ${namespace}`, err),
      );
      this.storagesMap.set(namespace, keyv);
    }

    this.logger.log(
      `Keyv storage initialized with namespaces: ${Object.values(StorageNamespace).join(', ')}`,
    );
  }

  async get(key: string, namespace: StorageNamespace): Promise<Buffer | null> {
    const keyv = this.storagesMap.get(namespace);
    if (!keyv) {
      this.logger.error(`No storage found for namespace ${namespace}`);
      return null;
    }
    const value = await keyv.get(key);
    return value ?? null;
  }

  async has(key: string, namespace: StorageNamespace): Promise<boolean> {
    const value = await this.get(key, namespace);
    return value !== null;
  }

  async set(
    key: string,
    value: Buffer,
    namespace: StorageNamespace,
  ): Promise<boolean> {
    const keyv = this.storagesMap.get(namespace);
    if (!keyv) {
      this.logger.error(`No storage found for namespace ${namespace}`);
      return false;
    }
    await keyv.set(key, value);
    return true;
  }
}
