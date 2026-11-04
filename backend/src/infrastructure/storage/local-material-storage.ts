import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MaterialStorage, StorageObjectNotFoundError } from "./material-storage.interface";

/** Filesystem adapter for local development (private directory, never served statically). */
export class LocalMaterialStorage implements MaterialStorage {
  constructor(private readonly root: string) {}

  /** Resolves a key to an absolute path, refusing anything that escapes the root directory. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, bytes);
  }

  async open(key: string): Promise<Readable> {
    const full = this.resolve(key);
    if (!(await this.exists(key))) throw new StorageObjectNotFoundError(key);
    return fs.createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
