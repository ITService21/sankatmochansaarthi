import { Readable } from "node:stream";

/** Thrown by adapters when an object key does not exist. */
export class StorageObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = "StorageObjectNotFoundError";
  }
}

/**
 * Provider-neutral private object storage. Business logic depends on this interface only —
 * never on the AWS SDK. Keys are server-generated (never user filenames).
 */
export interface MaterialStorage {
  /** Uploads bytes under `key` (private). @throws on storage failure */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Opens a read stream for `key`. @throws StorageObjectNotFoundError if missing */
  open(key: string): Promise<Readable>;
  /** Deletes `key`; deleting a missing key is a no-op. */
  delete(key: string): Promise<void>;
  /** @returns whether `key` exists */
  exists(key: string): Promise<boolean>;
}
