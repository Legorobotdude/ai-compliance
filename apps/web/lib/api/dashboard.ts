import type { DashboardSnapshot } from '@/lib/types/dashboard';
import { certivoApiFetch } from './client';

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  return certivoApiFetch<DashboardSnapshot>('/dashboard/snapshot');
}
