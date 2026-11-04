import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { MaterialStorage, StorageObjectNotFoundError } from "./material-storage.interface";

/**
 * AWS S3 adapter. The bucket must stay private (Block Public Access on); the backend streams objects
 * after authorising the request. Credentials come from the AWS default provider chain.
 */
export class S3MaterialStorage implements MaterialStorage {
  private readonly client: S3Client;
  constructor(private readonly bucket: string, region: string) {
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    this.client = new S3Client({ region });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: contentType, ServerSideEncryption: "AES256" }));
  }

  async open(key: string): Promise<Readable> {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return out.Body as Readable;
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") throw new StorageObjectNotFoundError(key);
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (e) {
      if ((e as { name?: string }).name === "NotFound") return false;
      throw e;
    }
  }
}
