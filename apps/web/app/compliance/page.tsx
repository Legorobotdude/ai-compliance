'use client';

import Link from 'next/link';
import { SectionCard } from '@/components/ui/section-card';
import { BomUploader } from '@/components/compliance/bom-uploader';
import { CertificateUploader } from '@/components/compliance/certificate-uploader';
import { MergedBomView } from '@/components/compliance/merged-bom-view';
import { IngestionIssuesPanel } from '@/components/compliance/ingestion-issues-panel';
import { RoleGate } from '@/components/rbac/role-gate';
import { RoleSwitcher } from '@/components/rbac/role-switcher';
import { useState } from 'react';

export default function CompliancePage() {
  const [activeBomId, setActiveBomId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleBomUploadComplete = (bomId: string) => {
    setActiveBomId(bomId);
    setRefreshKey((prev) => prev + 1);
  };

  const handleCertUploadComplete = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-900/30 p-8 text-white shadow-card lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-brand-300">Compliance Operations</p>
          <h1 className="mt-2 text-3xl font-semibold">BOM & Certificate Ingestion</h1>
          <p className="mt-2 text-slate-300">
            Upload Bill of Materials and compliance certificates, view merged compliance status, and review ingestion
            issues surfaced by the Compliance Service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Dashboard
          </Link>
          <Link
            href="/documents"
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-400 hover:text-brand-200"
          >
            Documents
          </Link>
          <RoleSwitcher />
        </div>
      </header>

      {/* Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="BOM Upload"
          description="Upload Bill of Materials (CSV/JSON/ZIP)"
        >
          <BomUploader onUploadComplete={handleBomUploadComplete} />
        </SectionCard>

        <SectionCard
          title="Certificate Upload"
          description="Upload compliance certificates (CSV/XML/PDF)"
        >
          <CertificateUploader onUploadComplete={handleCertUploadComplete} />
        </SectionCard>
      </div>

      {/* Merged BOM View */}
      {activeBomId && (
        <SectionCard
          title="Compliance Status"
          description="Real-time BOM compliance with latest certificate data"
        >
          <MergedBomView bomId={activeBomId} refreshKey={refreshKey} />
        </SectionCard>
      )}

      {/* Ingestion Issues - Analyst/Admin only */}
      <RoleGate allow={['analyst', 'admin']} fallback={<LockedIssuesCard />}>
        <SectionCard
          title="Ingestion Issues"
          description="Live backlog of Compliance Service ingestion issues that need analyst or admin intervention."
        >
          <IngestionIssuesPanel refreshKey={refreshKey} />
        </SectionCard>
      </RoleGate>
    </main>
  );
}

function LockedIssuesCard() {
  return (
    <div className="card border-dashed border-slate-800 text-sm text-slate-400">
      <p>Ingestion issues require Analyst/Admin privileges. Switch roles via the selector to inspect ingestion alerts.</p>
    </div>
  );
}
