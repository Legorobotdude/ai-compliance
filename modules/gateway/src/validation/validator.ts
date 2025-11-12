import type { ZodTypeAny, ZodError, ZodType } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class RequestValidationError extends Error {
  readonly status = 422;
  readonly details: ValidationIssue[];

  constructor(message: string, details: ValidationIssue[]) {
    super(message);
    this.details = details;
  }
}

export function validateWithSchema<T>(schema: ZodType<T>, payload: unknown): T {
  try {
    return schema.parse(payload);
  } catch (error) {
    const zodError = error as ZodError;
    const details: ValidationIssue[] = zodError.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message
    }));
    throw new RequestValidationError('Request validation failed', details);
  }
}

export type AnySchema = ZodTypeAny;
