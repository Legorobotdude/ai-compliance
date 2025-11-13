"use client";

import { useMemo } from "react";

export function LabActionPanel({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-5">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mb-4 mt-1 text-xs uppercase tracking-wide text-slate-400">{description}</p>
      {children}
    </div>
  );
}

export function LabActionFeedback({ result, error }: { result: string | null; error: string | null }) {
  const content = useMemo(() => {
    if (error) {
      return (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      );
    }
    if (result) {
      return (
        <pre className="max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-200">
          {result}
        </pre>
      );
    }
    return null;
  }, [error, result]);

  return content;
}

export async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await safeJson(response);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
