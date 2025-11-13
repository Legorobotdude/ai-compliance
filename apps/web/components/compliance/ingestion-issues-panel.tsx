'use client';

import { useState, useEffect } from 'react';

interface IngestionIssuesPanelProps {
  refreshKey?: number;
}

interface IngestionIssue {
  id: string;
  tenantId: string;
  sourceType: 'BOM' | 'CERTIFICATE';
  sourceBomId?: string | null;
  sourceCertificateId?: string | null;
  issueType: 'MISSING_SUPPLIER' | 'MISSING_VALUE' | 'INVALID_UNIT' | 'PARSE_ERROR';
  partNumber?: string | null;
  substanceName?: string | null;
  message: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string | null;
}

interface IngestionIssuesResponse {
  issues: IngestionIssue[];
  total: number;
}

const issueTypeColors = {
  MISSING_SUPPLIER: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  MISSING_VALUE: 'bg-orange-100 text-orange-800 border-orange-300',
  INVALID_UNIT: 'bg-red-100 text-red-300 border-red-300',
  PARSE_ERROR: 'bg-purple-100 text-purple-800 border-purple-300',
};

const issueTypeLabels = {
  MISSING_SUPPLIER: 'Missing Supplier',
  MISSING_VALUE: 'Missing Value',
  INVALID_UNIT: 'Invalid Unit',
  PARSE_ERROR: 'Parse Error',
};

export function IngestionIssuesPanel({ refreshKey }: IngestionIssuesPanelProps) {
  const [data, setData] = useState<IngestionIssuesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // In a real implementation, this would fetch from /api/compliance/issues
        // For now, we'll use the dashboard snapshot which includes ingestion issues
        const res = await fetch('/api/dashboard/snapshot');

        if (!res.ok) {
          throw new Error(`Failed to fetch dashboard snapshot (${res.status})`);
        }

        const response = await res.json();

        // Extract ingestion issues from dashboard data
        const issues: IngestionIssue[] = response.ingestion?.issues || [];

        setData({
          issues,
          total: issues.length,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issues');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-400">Loading ingestion issues...</div>
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

  const filteredIssues = data?.issues.filter((issue) =>
    showResolved ? true : !issue.resolved
  ) || [];

  const unresolvedCount = data?.issues.filter(i => !i.resolved).length || 0;
  const resolvedCount = data?.issues.filter(i => i.resolved).length || 0;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div>
            <div className="text-2xl font-bold text-orange-400">{unresolvedCount}</div>
            <div className="text-xs text-slate-400">Open Issues</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{resolvedCount}</div>
            <div className="text-xs text-slate-400">Resolved</div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-slate-700 text-brand-400 focus:ring-brand-400"
          />
          Show Resolved
        </label>
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="p-8 bg-gray-50 border border-slate-700 rounded-md text-center">
          <p className="text-slate-400">
            {showResolved
              ? 'No issues found'
              : '✓ No unresolved issues - all clear!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className={`p-4 border rounded-lg ${
                issue.resolved ? 'bg-gray-50 border-slate-700' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Issue Type Badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded border ${
                        issueTypeColors[issue.issueType]
                      }`}
                    >
                      {issueTypeLabels[issue.issueType]}
                    </span>
                    <span className="text-xs text-slate-400">
                      {issue.sourceType}
                    </span>
                    {issue.resolved && (
                      <span className="text-xs px-2 py-1 bg-green-900/30 text-green-300 rounded">
                        ✓ Resolved
                      </span>
                    )}
                  </div>

                  {/* Message */}
                  <p className="text-sm text-slate-400 mb-2">{issue.message}</p>

                  {/* Details */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                    {issue.partNumber && (
                      <span className="font-mono bg-slate-700 px-2 py-0.5 rounded">
                        Part: {issue.partNumber}
                      </span>
                    )}
                    {issue.substanceName && (
                      <span className="font-mono bg-slate-700 px-2 py-0.5 rounded">
                        Substance: {issue.substanceName}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {new Date(issue.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                {!issue.resolved && (
                  <button
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => {
                      // In real implementation, this would trigger a resolution workflow
                      console.log('Resolve issue:', issue.id);
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
