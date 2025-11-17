
'use client';

import { useCallback, useEffect, useState } from 'react';

import type { OpsIssue } from '@/lib/types/dashboard';

interface IngestionIssuesPanelProps {
  refreshKey?: number;
}

type SeverityFilter = 'all' | OpsIssue['severity'];

const severityBadgeStyles: Record<OpsIssue['severity'], string> = {
  critical: 'border-red-500/60 bg-red-500/10 text-red-200',
  warning: 'border-amber-400/60 bg-amber-500/10 text-amber-200',
  info: 'border-slate-600 bg-slate-800 text-slate-200',
};

const severityLabels: Record<OpsIssue['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

export function IngestionIssuesPanel({ refreshKey }: IngestionIssuesPanelProps) {
  const [issues, setIssues] = useState<OpsIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/dashboard/snapshot', { cache: 'no-store' });

      if (!res.ok) {
        throw new Error(`Failed to fetch dashboard snapshot (${res.status})`);
      }

      const response = await res.json();
      const snapshotIssues: OpsIssue[] =
        response.ingestionIssues || response.ingestion?.issues || [];

      setIssues(snapshotIssues);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
  }, [loadIssues, refreshKey]);

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

  const filteredIssues = issues.filter((issue) =>
    severityFilter === 'all' ? true : issue.severity === severityFilter
  );

  const severityCounts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 } as Record<OpsIssue['severity'], number>
  );

  return (
    <div className="space-y-4">
      {/* Header + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-white">{issues.length}</div>
          <div className="text-xs text-slate-400">Active ingestion issues</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {lastUpdated && (
            <span>Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={loadIssues}
            disabled={loading}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Severity filters */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSeverityFilter('all')}
          className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
            severityFilter === 'all'
              ? 'border-brand-400 bg-brand-500/10 text-white'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
          }`}
        >
          <div className="text-base font-semibold">All</div>
          <div>{issues.length} total</div>
        </button>
        {(Object.keys(severityLabels) as OpsIssue['severity'][]).map((severity) => (
          <button
            key={severity}
            type="button"
            onClick={() => setSeverityFilter(severity)}
            className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
              severityFilter === severity
                ? `${severityBadgeStyles[severity]} shadow-[0_0_18px_rgba(14,165,233,0.15)]`
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            <div className="text-base font-semibold">
              {severityLabels[severity]}
            </div>
            <div>{severityCounts[severity]} issues</div>
          </button>
        ))}
      </div>

      {/* Issues List */}
      {filteredIssues.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
          {issues.length === 0
            ? '✓ Compliance ingestion is clean—no issues from the latest snapshot.'
            : 'No issues match this filter.'}
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {filteredIssues.map((issue) => (
            <div
              key={issue.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${severityBadgeStyles[issue.severity]}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="font-mono text-slate-300">{issue.code}</span>
                    {issue.partNumber && (
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px]">
                        Part {issue.partNumber}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{issue.message}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    {issue.bomId && (
                      <span className="font-mono text-slate-500">BOM {issue.bomId.slice(0, 8)}…</span>
                    )}
                    {issue.assemblyId && (
                      <span className="font-mono text-slate-500">Assembly {issue.assemblyId}</span>
                    )}
                    <span>{new Date(issue.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-brand-400"
                    onClick={() => {
                      console.info('Open workflow for issue', issue.id);
                    }}
                  >
                    Open workflow
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 transition hover:border-slate-500"
                    onClick={() => {
                      console.info('Acknowledge issue', issue.id);
                    }}
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
