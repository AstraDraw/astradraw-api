/**
 * Storage namespace for different types of data
 */
export enum StorageNamespace {
  SCENES = 'scenes',
  ROOMS = 'rooms',
  FILES = 'files',
  THUMBNAILS = 'thumbnails',
}

/**
 * Interface for storage service implementations.
 * Both KeyvStorageService and S3StorageService implement this interface.
 */
export interface IStorageService {
  /**
   * Get a value from storage
   * @param key - The key to retrieve
   * @param namespace - The storage namespace (scenes, rooms, files)
   * @returns The stored buffer or null if not found
   */
  get(key: string, namespace: StorageNamespace): Promise<Buffer | null>;

  /**
   * Store a value in storage
   * @param key - The key to store under
   * @param value - The buffer to store
   * @param namespace - The storage namespace (scenes, rooms, files)
   * @returns true if successful
   */
  set(
    key: string,
    value: Buffer,
    namespace: StorageNamespace,
  ): Promise<boolean>;

  /**
   * Check if a key exists in storage
   * @param key - The key to check
   * @param namespace - The storage namespace (scenes, rooms, files)
   * @returns true if the key exists
   */
  has(key: string, namespace: StorageNamespace): Promise<boolean>;

  /**
   * Delete a value from storage
   * @param key - The key to delete
   * @param namespace - The storage namespace (scenes, rooms, files)
   * @returns true if successfully deleted
   */
  delete(key: string, namespace: StorageNamespace): Promise<boolean>;
}

/**
 * Injection token for the storage service
 */
export const STORAGE_SERVICE = 'STORAGE_SERVICE';
