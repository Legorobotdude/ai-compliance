import Link from 'next/link';
import { DocumentsPageClient } from '@/components/documents/documents-page-client';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-brand-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
                Document Management
              </h1>
              <p className="mt-2 text-slate-400">
                Upload, manage, and download compliance documents
              </p>
            </div>
            <nav className="flex gap-4">
              <Link
                href="/"
                className="px-4 py-2 text-sm border border-slate-700 rounded hover:bg-slate-800 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/compliance"
                className="px-4 py-2 text-sm border border-slate-700 rounded hover:bg-slate-800 transition-colors"
              >
                Compliance
              </Link>
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DocumentsPageClient />
        </div>

        {/* Features Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-brand-900/20 rounded-lg">
                <svg
                  className="h-6 w-6 text-brand-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Secure Upload</h3>
            </div>
            <p className="text-sm text-slate-400">
              Hash verification and tenant-isolated storage ensure your documents are secure
              and tamper-proof.
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-brand-900/20 rounded-lg">
                <svg
                  className="h-6 w-6 text-brand-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Signed Downloads</h3>
            </div>
            <p className="text-sm text-slate-400">
              Time-limited, signed download URLs provide secure access without exposing
              permanent storage locations.
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-brand-900/20 rounded-lg">
                <svg
                  className="h-6 w-6 text-brand-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Lifecycle Tracking</h3>
            </div>
            <p className="text-sm text-slate-400">
              Track upload status, scan results, retention policies, and parsed metadata throughout
              the document lifecycle.
            </p>
          </div>
        </div>

        {/* Features Overview */}
        <div className="mt-8 card p-6 border-l-4 border-brand-500">
          <h3 className="text-lg font-semibold text-slate-100 mb-2">
            Document Management Features
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Comprehensive document handling with secure storage and lifecycle tracking.
          </p>
          <div className="space-y-2 text-sm text-slate-400">
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Upload documents via pre-signed URLs or base64 content with integrity verification
              </span>
            </div>
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Track document metadata including upload status and scan results</span>
            </div>
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Flexible storage options with local filesystem or cloud storage (S3/MinIO)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 text-brand-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Integrated with CORA for automated document parsing and retention policies
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
