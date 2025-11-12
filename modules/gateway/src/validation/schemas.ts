import { z } from 'zod';
import type { BomUploadRequest } from '@certivo/compliance';
import type { CertificateUploadRequest } from '@certivo/compliance';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import type { UploadRequest } from '@certivo/file-document';
import type { SupplierRequestInput } from '@certivo/supplier';

export const uuidSchema = () => z.string().uuid();
const uuid = uuidSchema;
const nullableString = () => z.string().min(1).optional().nullable();

const componentSchema = z.object({
  partNumber: z.string().min(1),
  material: z.string().min(1).optional().nullable(),
  weightG: z.number().nonnegative().optional().nullable(),
  weightMg: z.number().nonnegative().optional().nullable()
});

const assemblySchema = z.object({
  assemblyId: z.string().min(1),
  name: z.string().min(1),
  parentAssemblyId: nullableString(),
  components: z.array(componentSchema).min(1)
});

export const bomUploadSchema = z
  .object({
    tenantId: z.string().min(1),
    productId: uuid(),
    uploadedBy: uuid(),
    sourceDocumentId: uuid().optional().nullable(),
    assemblies: z.array(assemblySchema).min(1)
  })
  .strict() satisfies z.ZodType<BomUploadRequest>;

const findingSchema = z.object({
  substanceName: z.string().min(1),
  concentrationValue: z.number().nonnegative().optional().nullable(),
  concentrationUnit: z.enum(['%', 'ppm', 'mg/kg']).optional().nullable(),
  concentrationRaw: z.string().min(1).optional().nullable()
});

const certificateSchema = z.object({
  supplierId: uuid(),
  partNumber: z.string().min(1),
  type: z.enum(['ROHS', 'REACH', 'CUSTOM']),
  declarationDate: nullableString(),
  validUntil: nullableString(),
  thresholdPpm: z.number().nonnegative().optional().nullable(),
  documentLimitSource: z.enum(['DOC', 'REGULATION']).optional().nullable(),
  sourceDocumentId: uuid().optional().nullable(),
  findings: z.array(findingSchema).min(1)
});

export const certificateUploadSchema = z
  .object({
    tenantId: z.string().min(1),
    certificates: z.array(certificateSchema).min(1)
  })
  .strict() satisfies z.ZodType<CertificateUploadRequest>;

export const supplierRequestSchema = z
  .object({
    tenantId: z.string().min(1),
    supplierId: uuid(),
    bomId: uuid(),
    dueAt: z.string().min(1),
    requestedBy: uuid()
  })
  .strict() satisfies z.ZodType<SupplierRequestInput>;

export const impactPredictSchema = z
  .object({
    tenantId: z.string().min(1),
    regulationCode: z.string().min(1),
    newLimitPpm: z.number().positive(),
    bomId: uuid().optional()
  })
  .strict() satisfies z.ZodType<ImpactPredictRequest>;

export const documentUploadSchema = z
  .object({
    tenantId: z.string().min(1),
    filename: z.string().min(1),
    mime: z.string().min(1),
    bytes: z.number().nonnegative(),
    storageUrl: z.string().min(1),
    sha256: z.string().length(64)
  })
  .strict() satisfies z.ZodType<UploadRequest>;
