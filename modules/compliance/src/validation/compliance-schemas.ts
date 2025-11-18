import { z } from 'zod';
import type {
  BomUploadDocument,
  BomUploadRequest,
  BomUploadResponse,
  MergedViewRequest,
  MergedViewResponse
} from '../dtos/bom-dtos.js';
import type {
  CertificateUploadRequest,
  CertificateUploadResponse
} from '../dtos/certificate-dtos.js';
import type { CreateProductRequest } from '../dtos/product-dtos.js';

const uuid = () => z.string().uuid();
const tenantId = () => z.string().min(1);
const nullableString = () => z.string().min(1).optional().nullable();
const nonEmpty = () => z.string().min(1);

const bomComponentSchema = z
  .object({
    partNumber: nonEmpty(),
    material: nonEmpty().optional().nullable(),
    weightG: z.number().nonnegative().optional().nullable(),
    weightMg: z.number().nonnegative().optional().nullable()
  })
  .strict();

const bomAssemblySchema = z
  .object({
    assemblyId: nonEmpty(),
    name: nonEmpty(),
    parentAssemblyId: nullableString(),
    components: z.array(bomComponentSchema).min(1)
  })
  .strict();

const bomDocumentSchema = z
  .object({
    filename: nonEmpty(),
    mimeType: nonEmpty(),
    encoding: z.enum(['base64', 'utf8']).optional().default('base64'),
    content: nonEmpty()
  })
  .strict() satisfies z.ZodType<BomUploadDocument>;

const bomUploadRequestBaseSchema = z
  .object({
    tenantId: tenantId(),
    productId: uuid(),
    uploadedBy: uuid(),
    sourceDocumentId: uuid().optional().nullable(),
    assemblies: z.array(bomAssemblySchema).min(1).optional(),
    document: bomDocumentSchema.optional()
  })
  .strict();

export const bomUploadRequestSchema = bomUploadRequestBaseSchema.superRefine((value, ctx) => {
  const hasAssemblies = Array.isArray(value.assemblies) && value.assemblies.length > 0;
  if (!hasAssemblies && !value.document) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assemblies'],
      message: 'Provide assemblies or a document payload for ingestion'
    });
  }
}) satisfies z.ZodType<BomUploadRequest>;

const productCodeSchema = () =>
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Code may only include letters, numbers, dots, hyphens, or underscores');

export const productCreateRequestSchema = z
  .object({
    tenantId: tenantId(),
    productName: nonEmpty(),
    code: productCodeSchema().optional(),
    createdBy: uuid().optional()
  })
  .strict() satisfies z.ZodType<CreateProductRequest>;

const ingestionIssueSchema = z
  .object({
    code: nonEmpty(),
    message: nonEmpty(),
    partNumber: nonEmpty().optional()
  })
  .strict();

export const bomUploadResponseSchema = z
  .object({
    bomId: uuid(),
    assemblies: z.number().int().nonnegative(),
    components: z.number().int().nonnegative(),
    issues: z.array(ingestionIssueSchema)
  })
  .strict() satisfies z.ZodType<BomUploadResponse>;

const certificateFindingSchema = z
  .object({
    substanceName: nonEmpty(),
    concentrationValue: z.number().nonnegative().optional().nullable(),
    concentrationUnit: z.enum(['%', 'ppm', 'mg/kg']).optional().nullable(),
    concentrationRaw: nonEmpty().optional().nullable()
  })
  .strict();

const certificateCoreSchema = z
  .object({
    supplierId: uuid(),
    partNumber: nonEmpty(),
    type: z.enum(['ROHS', 'REACH', 'CUSTOM']),
    declarationDate: nullableString(),
    validUntil: nullableString(),
    thresholdPpm: z.number().nonnegative().optional().nullable(),
    documentLimitSource: z.enum(['DOC', 'REGULATION']).optional().nullable(),
    sourceDocumentId: uuid().optional().nullable(),
    findings: z.array(certificateFindingSchema).default([])
  })
  .strict();

const certificateSchema = certificateCoreSchema.superRefine((value, ctx) => {
  if (value.findings.length === 0 && !value.sourceDocumentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['findings'],
      message: 'Provide findings or a sourceDocumentId for CORA parsing'
    });
  }
});

export const certificateUploadRequestSchema = z
  .object({
    tenantId: tenantId(),
    certificates: z.array(certificateSchema).min(1)
  })
  .strict() satisfies z.ZodType<CertificateUploadRequest>;

const certificateUploadIssueSchema = z
  .object({
    code: z.enum(['VALUE_MISSING', 'UNIT_MISSING', 'PARSE_FAILED', 'CORA_AMBIGUITY']),
    message: nonEmpty(),
    partNumber: nonEmpty(),
    substanceName: nonEmpty().optional()
  })
  .strict();

const certificateUploadResultSchema = z
  .object({
    certificateId: uuid(),
    findings: z.number().int().nonnegative(),
    validUntil: nullableString(),
    dataQualityFlags: z.number().int().nonnegative()
  })
  .strict();

export const certificateUploadResponseSchema = z
  .object({
    items: z.array(certificateUploadResultSchema),
    issues: z.array(certificateUploadIssueSchema)
  })
  .strict() satisfies z.ZodType<CertificateUploadResponse>;

const complianceStatusEnum = z.enum(['COMPLIANT', 'MISSING', 'EXPIRED', 'OVER_LIMIT']);

export const mergedViewRequestSchema = z
  .object({
    tenantId: tenantId(),
    bomId: uuid(),
    limit: z.number().int().min(25).max(500).optional(),
    offset: z.number().int().min(0).optional(),
    status: complianceStatusEnum.optional(),
    query: z.string().trim().min(1).optional()
  })
  .strict() satisfies z.ZodType<MergedViewRequest>;

const mergedViewFindingSchema = z
  .object({
    substance: nonEmpty(),
    ppm: z.number(),
    thresholdPpm: z.number().nonnegative().optional().nullable()
  })
  .strict();

const mergedViewItemSchema = z
  .object({
    bomId: uuid(),
    assemblyId: nonEmpty(),
    partNumber: nonEmpty(),
    supplierId: uuid().optional().nullable(),
    status: complianceStatusEnum,
    validUntil: nullableString(),
    findings: z.array(mergedViewFindingSchema).optional()
  })
  .strict();

export const mergedViewResponseSchema = z
  .object({
    bomId: uuid(),
    items: z.array(mergedViewItemSchema),
    pagination: z
      .object({
        limit: z.number().int().positive(),
        offset: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        hasMore: z.boolean()
      })
      .strict(),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        counts: z.record(complianceStatusEnum, z.number().int().nonnegative())
      })
      .strict()
  })
  .strict() satisfies z.ZodType<MergedViewResponse>;

export function parseBomUploadRequest(payload: unknown): BomUploadRequest {
  return bomUploadRequestSchema.parse(payload);
}

export function parseCertificateUploadRequest(payload: unknown): CertificateUploadRequest {
  return certificateUploadRequestSchema.parse(payload);
}

export function parseMergedViewRequest(payload: unknown): MergedViewRequest {
  return mergedViewRequestSchema.parse(payload);
}

export function parseProductCreateRequest(payload: unknown): CreateProductRequest {
  return productCreateRequestSchema.parse(payload);
}
