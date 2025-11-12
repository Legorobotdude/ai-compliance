import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantID, UUID } from './schema.js';

export interface TenantExecutionContext {
  tenantId: TenantID;
  roles: string[];
  userId?: UUID;
  email?: string;
}

const storage = new AsyncLocalStorage<TenantExecutionContext>();

export function runWithTenantContext<T>(context: TenantExecutionContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getTenantContext(): TenantExecutionContext | undefined {
  return storage.getStore();
}
