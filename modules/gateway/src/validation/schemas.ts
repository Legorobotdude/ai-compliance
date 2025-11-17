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
const ragSourceType = () => z.enum(['DOCUMENT', 'REGULATION', 'NOTE']);

export const supplierRequestSchema = z
  .object({
    tenantId: z.string().min(1),
    supplierId: uuid(),
    bomId: uuid(),
    requestedBy: uuid(),
    dueAt: z.string().min(1).optional(),
    tone: z.enum(['formal', 'neutral', 'friendly']).optional(),
    languageOverride: z.string().min(2).max(5).optional()
  })
  .strict() satisfies z.ZodType<SupplierRequestInput>;

const impactLimitOverrideSchema = z
  .object({
    substance: z.string().min(1),
    limitPpm: z.number().positive()
  })
  .strict();

export const impactPredictSchema = z
  .object({
    tenantId: z.string().min(1),
    regulationCode: z.string().min(1),
    newLimitPpm: z.number().positive().optional(),
    limitVector: z.array(impactLimitOverrideSchema).min(1).optional(),
    ttlMinutes: z.number().int().positive().max(24 * 60).optional(),
    bomId: uuid().optional()
  })
  .refine((value) => Boolean(value.newLimitPpm || (value.limitVector?.length ?? 0) > 0), {
    message: 'Provide either newLimitPpm or limitVector',
    path: ['limitVector']
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

export const ragDocumentIngestSchema = z
  .object({
    tenantId: z.string().min(1),
    sourceKey: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    description: z.string().optional(),
    sourceDocumentId: uuid().optional(),
    regulationId: uuid().optional(),
    sourceUrl: z.string().url().optional(),
    sourceType: ragSourceType().optional(),
    language: z.string().min(2).max(10).optional(),
    metadata: z.record(z.string(), z.any()).optional()
  })
  .strict();

const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1)
  })
  .strict();

const searchFiltersSchema = z
  .object({
    sourceTypes: z.array(ragSourceType()).min(1).optional(),
    documentIds: z.array(uuid()).min(1).optional(),
    sourceKeys: z.array(z.string().min(1)).min(1).optional(),
    minScore: z.number().min(0).max(10).optional()
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one filter field when using filters'
  })
  .optional();

export const aiChatSchema = z
  .object({
    tenantId: z.string().min(1),
    conversationId: uuid().optional(),
    messages: z.array(chatMessageSchema).min(1),
    topK: z.number().int().min(1).max(25).optional(),
    filters: searchFiltersSchema
  })
  .refine((value) => value.messages.some((message) => message.role === 'user'), {
    message: 'Provide at least one user message',
    path: ['messages']
  })
  .strict();
