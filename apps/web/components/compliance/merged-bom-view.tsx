'use client';

import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface MergedBomViewProps {
  bomId: string;
  refreshKey?: number;
}

type ComplianceStatus = 'COMPLIANT' | 'MISSING' | 'EXPIRED' | 'OVER_LIMIT';

interface Finding {
  substance: string;
  ppm: number;
  thresholdPpm?: number | null;
}

interface MergedItem {
  bomId: string;
  assemblyId: string;
  partNumber: string;
  supplierId?: string | null;
  status: ComplianceStatus;
  validUntil?: string | null;
  findings?: Finding[];
}

interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

type StatusCounts = Record<ComplianceStatus, number>;

interface SummaryMeta {
  total: number;
  counts: StatusCounts;
}

interface MergedBomResponse {
  bomId: string;
  items: MergedItem[];
  pagination: PaginationMeta;
  summary: SummaryMeta;
}

const statusColors: Record<ComplianceStatus, string> = {
  COMPLIANT: 'bg-green-900/30 text-green-300 border-green-300',
  MISSING: 'bg-slate-700 text-slate-400 border-slate-700',
  EXPIRED: 'bg-orange-100 text-orange-800 border-orange-300',
  OVER_LIMIT: 'bg-red-100 text-red-300 border-red-300',
};

const statusIcons: Record<ComplianceStatus, string> = {
  COMPLIANT: '✓',
  MISSING: '?',
  EXPIRED: '⏰',
  OVER_LIMIT: '⚠',
};

const DEFAULT_STATUS_COUNTS: StatusCounts = {
  COMPLIANT: 0,
  MISSING: 0,
  EXPIRED: 0,
  OVER_LIMIT: 0,
};

const PAGE_SIZES = [50, 100, 250] as const;

export function MergedBomView({ bomId, refreshKey }: MergedBomViewProps) {
  const [data, setData] = useState<MergedBomResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[1]);

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);

    return () => {
      clearTimeout(handle);
    };
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [bomId, statusFilter, debouncedQuery]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', String(pageSize));
        params.set('offset', String((page - 1) * pageSize));
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        if (debouncedQuery) {
          params.set('query', debouncedQuery);
        }

        const res = await fetch(`/api/compliance/merged/${bomId}?${params.toString()}`);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch merged BOM (${res.status})`);
        }

        const response = (await res.json()) as MergedBomResponse;
        const totalPagesFromResponse =
          response.pagination.total > 0
            ? Math.ceil(response.pagination.total / response.pagination.limit)
            : 1;

        if (page > totalPagesFromResponse) {
          setPage(totalPagesFromResponse);
          return;
        }

        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bomId, refreshKey, page, pageSize, statusFilter, debouncedQuery]);

  const items = data?.items ?? [];
  const summaryCounts = data?.summary?.counts ?? DEFAULT_STATUS_COUNTS;
  const overallTotal = data?.summary?.total ?? 0;
  const pagination = data?.pagination;
  const filteredTotal = pagination?.total ?? 0;
  const rangeStart = pagination && items.length > 0 ? pagination.offset + 1 : 0;
  const rangeEnd = pagination ? pagination.offset + items.length : 0;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;
  const canGoPrevious = page > 1;
  const canGoNext = Boolean(pagination?.hasMore);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-400">Loading compliance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-md">
        <p className="text-sm text-red-300">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 bg-gray-50 border border-slate-700 rounded-md text-center">
        <p className="text-slate-400">No BOM data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`p-3 rounded-lg border-2 transition-colors ${
            statusFilter === 'ALL'
              ? 'border-brand-400 bg-blue-50'
              : 'border-slate-700 hover:border-slate-700'
          }`}
        >
          <div className="text-2xl font-bold text-slate-400">{overallTotal}</div>
          <div className="text-xs text-slate-400">Total Parts</div>
        </button>

        {(['COMPLIANT', 'MISSING', 'EXPIRED', 'OVER_LIMIT'] as ComplianceStatus[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`p-3 rounded-lg border-2 transition-colors ${
                statusFilter === status
                  ? `border-${status === 'COMPLIANT' ? 'green' : status === 'MISSING' ? 'gray' : status === 'EXPIRED' ? 'orange' : 'red'}-500 ${statusColors[status]}`
                  : 'border-slate-700 hover:border-slate-700'
              }`}
            >
              <div className="text-2xl font-bold">
                {statusIcons[status]} {summaryCounts[status] || 0}
              </div>
              <div className="text-xs capitalize">{status.replace('_', ' ')}</div>
            </button>
          )
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-1 gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by part number or assembly..."
            className="flex-1 px-3 py-2 border border-slate-700 rounded-md focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
          {(statusFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setSearchQuery('');
              }}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-md transition"
            >
              Clear Filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Virtualized Table */}
      <div
        ref={parentRef}
        className="h-96 overflow-auto border border-slate-700 rounded-lg bg-slate-900"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="border-b border-slate-700 hover:bg-gray-50"
              >
                <div className="p-3 flex items-start gap-3">
                  {/* Status Badge */}
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded border ${statusColors[item.status]}`}
                  >
                    {statusIcons[item.status]} {item.status}
                  </span>

                  {/* Part Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-slate-400">
                        {item.partNumber}
                      </span>
                      <span className="text-xs text-slate-400">{item.assemblyId}</span>
                    </div>

                    {/* Findings */}
                    {item.findings && item.findings.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {item.findings.map((finding, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-0.5 bg-slate-700 rounded"
                          >
                            {finding.substance}: {finding.ppm} ppm
                            {finding.thresholdPpm && ` / ${finding.thresholdPpm} ppm`}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expiry */}
                    {item.validUntil && (
                      <div className="mt-1 text-xs text-slate-400">
                        Expires: {new Date(item.validUntil).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Supplier */}
                  {item.supplierId && (
                    <div className="text-xs text-slate-400">
                      Supplier: {item.supplierId}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex flex-col gap-3 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <div>
          {filteredTotal === 0
            ? 'No parts match the current filters.'
            : `Showing ${rangeStart}-${rangeEnd} of ${filteredTotal} parts${
                statusFilter !== 'ALL' ? ` (${statusFilter.toLowerCase()})` : ''
              }`}
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <span>
            Page {filteredTotal === 0 ? 0 : page} of {filteredTotal === 0 ? 0 : totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!canGoPrevious}
              className="rounded-full border border-slate-700 px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-500"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => current + 1)}
              disabled={!canGoNext}
              className="rounded-full border border-slate-700 px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-500"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
