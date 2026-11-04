import path from "node:path";
import { env } from "../../config/env";
import { LocalMaterialStorage } from "./local-material-storage";
import { MaterialStorage } from "./material-storage.interface";
import { MemoryMaterialStorage } from "./memory-material-storage";
import { S3MaterialStorage } from "./s3-material-storage";

let instance: MaterialStorage | null = null;

/** Returns the configured storage adapter (STORAGE_DRIVER = s3 | local | memory). Singleton. */
export function getStorage(): MaterialStorage {
  if (!instance) {
    if (env.storage.driver === "s3") instance = new S3MaterialStorage(env.storage.bucket, env.storage.region);
    else if (env.storage.driver === "memory") instance = new MemoryMaterialStorage();
    else instance = new LocalMaterialStorage(path.resolve(env.storage.localDir));
  }
  return instance;
}

/** Test hook: swap the adapter. */
export function setStorage(s: MaterialStorage | null): void {
  instance = s;
}
