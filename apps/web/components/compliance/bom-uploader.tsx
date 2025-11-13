'use client';

import { useState } from 'react';

interface BomUploaderProps {
  onUploadComplete?: (bomId: string) => void;
}

interface BomUploadResponse {
  bomId: string;
  assemblies: number;
  components: number;
  issues: Array<{
    code: string;
    message: string;
    partNumber?: string;
  }>;
}

type UploadMode = 'file' | 'json';

export function BomUploader({ onUploadComplete }: BomUploaderProps) {
  const [mode, setMode] = useState<UploadMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [productId, setProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BomUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      let payload: any;

      if (mode === 'file' && file) {
        // Read file content
        const content = await file.text();
        payload = {
          productId,
          uploadedBy: '45c6686f-886c-e4ec-2378-fb8cfed7fcaf', // Default user from seed data
          document: {
            filename: file.name,
            mimeType: file.type || 'text/csv',
            encoding: 'utf8',
            content,
          },
        };
      } else if (mode === 'json' && jsonInput) {
        // Parse JSON input
        const parsedJson = JSON.parse(jsonInput);
        payload = {
          productId,
          uploadedBy: '45c6686f-886c-e4ec-2378-fb8cfed7fcaf', // Default user from seed data
          ...parsedJson,
        };
      } else {
        throw new Error('Please provide a file or JSON input');
      }

      const res = await fetch('/api/compliance/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed (${res.status})`);
      }

      const response = await res.json() as BomUploadResponse;
      setResult(response);
      onUploadComplete?.(response.bomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const sampleJson = {
    assemblies: [
      {
        assemblyId: 'CTRL-UNIT',
        name: 'Control Unit',
        components: [
          {
            partNumber: 'CU-78901',
            material: 'PCB Assembly',
            weightG: 45.2,
          },
        ],
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setMode('file')}
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'file'
              ? 'border-b-2 border-brand-400 text-brand-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => setMode('json')}
          className={`px-4 py-2 font-medium transition-colors ${
            mode === 'json'
              ? 'border-b-2 border-brand-400 text-brand-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          JSON Input
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Product ID */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Product ID *
          </label>
          <input
            type="text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="e.g., PROD-001"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white placeholder-slate-400 focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            required
          />
        </div>

        {/* File Upload Mode */}
        {mode === 'file' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              BOM File (CSV/JSON) *
            </label>
            <input
              type="file"
              accept=".csv,.json,.zip"
              onChange={handleFileChange}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-400 file:text-white hover:file:bg-brand-500 focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              required
            />
            {file && (
              <p className="mt-1 text-sm text-slate-400">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>
        )}

        {/* JSON Input Mode */}
        {mode === 'json' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              BOM JSON *
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={JSON.stringify(sampleJson, null, 2)}
              className="w-full h-48 px-3 py-2 bg-slate-800 border border-slate-700 rounded-md font-mono text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-400 focus:border-transparent"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Paste JSON with assemblies and components
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 bg-brand-400 text-white font-medium rounded-md hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Uploading...' : 'Upload BOM'}
        </button>
      </form>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-md">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Success Result */}
      {result && (
        <div className="p-4 bg-green-900/20 border border-green-800 rounded-md space-y-2">
          <p className="font-medium text-green-300">Upload Successful!</p>
          <div className="text-sm text-green-200 space-y-1">
            <p>BOM ID: <span className="font-mono">{result.bomId}</span></p>
            <p>Assemblies: {result.assemblies}</p>
            <p>Components: {result.components}</p>
          </div>

          {result.issues.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-800">
              <p className="font-medium text-green-300 mb-2">
                Issues ({result.issues.length}):
              </p>
              <ul className="space-y-1 text-sm text-green-200">
                {result.issues.map((issue, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-mono text-xs bg-green-800 px-1 rounded">
                      {issue.code}
                    </span>
                    <span>
                      {issue.message}
                      {issue.partNumber && ` (${issue.partNumber})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
