import { z } from 'zod';
import { bomUploadRequestSchema, certificateUploadRequestSchema } from '@certivo/compliance';
import type { ImpactPredictRequest } from '@certivo/risk-impact';
import type { UploadRequest } from '@certivo/file-document';
import type { SupplierRequestInput } from '@certivo/supplier';
import type {
  AiParseDocumentRequest,
  AiRiskSummaryRequest,
  AiSupplierEmailRequest
} from '@certivo/cora';

export const uuidSchema = () => z.string().uuid();
const uuid = uuidSchema;
export const bomUploadSchema = bomUploadRequestSchema;
export const certificateUploadSchema = certificateUploadRequestSchema;

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
    storageUrl: z.string().min(1).optional(),
    sha256: z.string().length(64),
    dataBase64: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.storageUrl || value.dataBase64), {
    message: 'Provide either storageUrl or dataBase64',
    path: ['storageUrl']
  })
  .strict() satisfies z.ZodType<UploadRequest>;

export const aiParseDocumentSchema = z
  .object({
    tenantId: z.string().min(1),
    documentId: uuid(),
    schema: z.literal('certificate_v1').optional(),
    downloadUrl: z.string().url().optional()
  })
  .strict() satisfies z.ZodType<AiParseDocumentRequest>;

export const aiSupplierEmailSchema = z
  .object({
    tenantId: z.string().min(1),
    supplierId: uuid(),
    bomId: uuid(),
    language: z.string().min(2).max(5).optional(),
    tone: z.enum(['formal', 'neutral', 'friendly']).optional()
  })
  .strict() satisfies z.ZodType<AiSupplierEmailRequest>;

export const aiRiskSummarySchema = z
  .object({
    tenantId: z.string().min(1),
    bomId: uuid().optional(),
    productId: uuid().optional()
  })
  .refine((value) => Boolean(value.bomId || value.productId), {
    message: 'Either bomId or productId must be provided'
  })
  .strict() satisfies z.ZodType<AiRiskSummaryRequest>;
