import type { CoraRiskSummary } from '@/lib/types/cora';

export function RiskSummaryView({ summary }: { summary: CoraRiskSummary }) {
  const severity = deriveSeverity(summary.execSummary);
  const summaryParagraphs = splitParagraphs(summary.summary);
  const statConfig = getStatConfig();
  const renderedKeys = new Set(statConfig.map((item) => item.key));
  const extraStats = Object.entries(summary.stats ?? {}).filter(([key]) => !renderedKeys.has(key));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Executive summary</p>
            <p className="mt-1 text-base font-semibold text-white">{severity.headline}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${severity.badgeBg} ${severity.badgeText}`}>
            {severity.level}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{summary.execSummary}</p>
        {summaryParagraphs.length > 0 && (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-200">
            {summaryParagraphs.map((paragraph, index) => (
              <p key={index} className="text-slate-300">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Compliance snapshot</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {statConfig.map((item) => (
            <div key={item.key} className={`rounded-2xl border ${item.border} bg-slate-950/40 p-4 shadow-inner`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${item.accent}`}>{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {summary.stats?.[item.key] != null ? summary.stats[item.key].toLocaleString() : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-400">{item.helper}</p>
            </div>
          ))}
        </div>
        {extraStats.length > 0 && (
          <div className="mt-4 text-xs text-slate-400">
            <p className="mb-2 font-semibold text-white">Additional metrics</p>
            <ul className="space-y-1">
              {extraStats.map(([key, value]) => (
                <li key={key} className="flex items-center justify-between rounded-lg border border-slate-800/70 px-3 py-2">
                  <span className="font-mono text-slate-400">{key}</span>
                  <span className="text-white">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Top supplier gaps</p>
        {summary.topGaps.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No supplier gaps detected in this snapshot.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {summary.topGaps.map((gap) => (
              <div
                key={`${gap.supplierName}-${gap.reason}`}
                className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-white">{gap.supplierName}</p>
                    <p className="text-xs text-slate-400">{formatReason(gap.reason)}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>Avg turnaround: {gap.etaDays ? `${gap.etaDays}d` : 'n/a'}</p>
                    <p>Impacted parts: {gap.partNumbers.length}</p>
                  </div>
                </div>
                {gap.partNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {gap.partNumbers.slice(0, 5).map((partNumber) => (
                      <span key={partNumber} className="rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-200">
                        {partNumber}
                      </span>
                    ))}
                    {gap.partNumbers.length > 5 && (
                      <span className="text-xs text-slate-400">+{gap.partNumbers.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function deriveSeverity(execSummary: string) {
  const match = execSummary.match(/(GREEN|YELLOW|RED|AMBER|ORANGE|LOW|MEDIUM|HIGH)/i);
  const level = (match?.[1] ?? 'INFO').toUpperCase();
  const palette: Record<string, { badgeBg: string; badgeText: string; headline: string }> = {
    GREEN: { badgeBg: 'bg-emerald-500/20', badgeText: 'text-emerald-200', headline: 'Coverage is healthy' },
    YELLOW: { badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-200', headline: 'Watch items closely' },
    AMBER: { badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-200', headline: 'Watch items closely' },
    ORANGE: { badgeBg: 'bg-orange-500/20', badgeText: 'text-orange-200', headline: 'Escalations recommended' },
    RED: { badgeBg: 'bg-rose-600/20', badgeText: 'text-rose-200', headline: 'Immediate action required' },
    HIGH: { badgeBg: 'bg-rose-600/20', badgeText: 'text-rose-200', headline: 'Immediate action required' },
    MEDIUM: { badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-200', headline: 'Watch items closely' },
    LOW: { badgeBg: 'bg-emerald-500/20', badgeText: 'text-emerald-200', headline: 'Coverage is healthy' },
    INFO: { badgeBg: 'bg-slate-500/20', badgeText: 'text-slate-200', headline: 'Latest assessment' }
  };
  const variant = palette[level] ?? palette.INFO;
  return { level, ...variant };
}

function splitParagraphs(summary: string) {
  return summary
    .split(/\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function getStatConfig() {
  return [
    {
      key: 'over_limit_parts',
      label: 'Over limit parts',
      helper: 'Parts exceeding RoHS/REACH thresholds',
      accent: 'text-rose-300',
      border: 'border-rose-500/40'
    },
    {
      key: 'missing_parts',
      label: 'Missing evidence',
      helper: 'Parts without certificates on file',
      accent: 'text-amber-200',
      border: 'border-amber-400/30'
    },
    {
      key: 'expired_certs',
      label: 'Expired certificates',
      helper: 'Assemblies with lapsed coverage',
      accent: 'text-orange-200',
      border: 'border-orange-400/30'
    },
    {
      key: 'upcoming_expirations',
      label: 'Expiring (<90d)',
      helper: 'Certificates approaching renewal',
      accent: 'text-sky-200',
      border: 'border-sky-400/30'
    }
  ] as const;
}

function formatReason(reason: 'MISSING' | 'EXPIRED' | 'OVER_LIMIT') {
  switch (reason) {
    case 'MISSING':
      return 'Missing certificates';
    case 'EXPIRED':
      return 'Expired coverage';
    case 'OVER_LIMIT':
      return 'Over regulatory limits';
    default:
      return reason;
  }
}
