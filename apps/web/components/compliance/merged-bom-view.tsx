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

interface MergedBomResponse {
  bomId: string;
  items: MergedItem[];
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

export function MergedBomView({ bomId, refreshKey }: MergedBomViewProps) {
  const [data, setData] = useState<MergedBomResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ComplianceStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/compliance/merged/${bomId}`);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch merged BOM (${res.status})`);
        }

        const response = await res.json() as MergedBomResponse;
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bomId, refreshKey]);

  const filteredItems = data?.items.filter((item) => {
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      item.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assemblyId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  }) || [];

  const virtualizer = useVirtualizer({
    count: filteredItems.length,
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

  if (!data || data.items.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-slate-700 rounded-md text-center">
        <p className="text-slate-400">No BOM data available</p>
      </div>
    );
  }

  const statusCounts = data.items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<ComplianceStatus, number>);

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
          <div className="text-2xl font-bold text-slate-400">{data.items.length}</div>
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
                {statusIcons[status]} {statusCounts[status] || 0}
              </div>
              <div className="text-xs capitalize">{status.replace('_', ' ')}</div>
            </button>
          )
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by part number or assembly..."
          className="flex-1 px-3 py-2 border border-slate-700 rounded-md focus:ring-2 focus:ring-brand-400 focus:border-transparent"
        />
        {statusFilter !== 'ALL' && (
          <button
            onClick={() => setStatusFilter('ALL')}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-400"
          >
            Clear Filter
          </button>
        )}
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
            const item = filteredItems[virtualRow.index];
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
      <div className="text-sm text-slate-400 text-center">
        Showing {filteredItems.length} of {data.items.length} parts
      </div>
    </div>
  );
}
