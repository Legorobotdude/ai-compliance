export interface IngestionErrorDetail {
  file?: string;
  reason: string;
}

export class BomIngestionError extends Error {
  readonly status = 422;
  constructor(message: string, readonly details?: IngestionErrorDetail[]) {
    super(message);
  }
}
