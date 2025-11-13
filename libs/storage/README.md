# Storage helpers

Cross-package helpers for writing documents to object storage. Provides an interface
(`StorageAdapter`) plus a local filesystem implementation so the File/Document module
can persist uploads without requiring MinIO/S3 during development.

## Local fallback

```ts
import { LocalFileStorage } from '@certivo/lib-storage';

const storage = new LocalFileStorage({ rootDirectory: '/tmp/certivo-docs' });

await storage.saveObject({
  tenantId: 'tenant-123',
  documentId: 'doc-456',
  filename: 'cert.pdf',
  data: Buffer.from('example'),
  contentType: 'application/pdf'
});
```

The adapter writes files under `<root>/<bucket>/<tenant>/<document>/<filename>` and
returns a file:// URL + metadata so higher-level services can record storage references.
