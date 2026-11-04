import { Readable } from "node:stream";
import { MaterialStorage, StorageObjectNotFoundError } from "./material-storage.interface";

/** In-memory adapter used by tests; `failPut` simulates storage outages. */
export class MemoryMaterialStorage implements MaterialStorage {
  readonly objects = new Map<string, Buffer>();
  failPut = false;

  async put(key: string, bytes: Buffer, _contentType?: string): Promise<void> {
    if (this.failPut) throw new Error("simulated storage failure");
    this.objects.set(key, bytes);
  }
  async open(key: string): Promise<Readable> {
    const b = this.objects.get(key);
    if (!b) throw new StorageObjectNotFoundError(key);
    return Readable.from(b);
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}
