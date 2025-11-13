import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  GetObjectParams,
  RetrievedObject,
  SaveObjectParams,
  StorageAdapter,
  StorageObjectReference
} from './types.js';

export interface LocalFileStorageOptions {
  rootDirectory: string;
  bucket?: string;
}

export class LocalFileStorage implements StorageAdapter {
  private readonly rootDir: string;
  private readonly bucket: string;

  constructor(options: LocalFileStorageOptions) {
    if (!options.rootDirectory) {
      throw new Error('LocalFileStorage requires a rootDirectory');
    }
    this.rootDir = options.rootDirectory;
    this.bucket = options.bucket ?? 'local-documents';
  }

  async saveObject(params: SaveObjectParams): Promise<StorageObjectReference> {
    const safeFilename = sanitizeFilename(params.filename);
    const key = `${params.tenantId}/${params.documentId}/${safeFilename}`;
    const absolutePath = join(this.rootDir, this.bucket, key);
    const directory = dirname(absolutePath);
    await mkdir(directory, { recursive: true });
    await writeFile(absolutePath, params.data);

    return {
      bucket: this.bucket,
      key,
      url: pathToFileURL(absolutePath).toString(),
      storageClass: 'LOCAL'
    };
  }

  async getObject(params: GetObjectParams): Promise<RetrievedObject> {
    const absolutePath = this.resolvePath(params);
    const fileStats = await stat(absolutePath);
    return {
      stream: createReadStream(absolutePath),
      contentLength: fileStats.size
    };
  }

  private resolvePath(params: GetObjectParams): string {
    if (params.bucket && params.key) {
      return join(this.rootDir, params.bucket, params.key);
    }
    if (params.url?.startsWith('file://')) {
      return fileURLToPath(params.url);
    }
    if (params.url && params.url.startsWith('/')) {
      return params.url;
    }
    throw new Error('LocalFileStorage cannot resolve object path; bucket/key or file:// url required');
  }
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.normalize('NFKC').replace(/[/\\]/g, '_').trim();
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.length > 0 ? safe : 'file';
}
