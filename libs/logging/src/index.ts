import pino, { type LoggerOptions, type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export interface RequestLogContext {
  requestId?: string;
  tenantId?: string;
  route?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = process.env.LOG_LEVEL ?? 'info';
  return pino({
    level,
    base: { env: process.env.NODE_ENV ?? 'development' },
    ...options
  });
}

export function createRequestLogger(logger: Logger, context: RequestLogContext): Logger {
  return logger.child({
    requestId: context.requestId,
    tenantId: context.tenantId,
    route: context.route
  });
}
