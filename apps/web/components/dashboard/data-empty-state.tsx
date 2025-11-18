import type { ReactNode } from "react";

import { SectionCard } from "@/components/ui/section-card";

type DataEmptyStateProps = {
  title: string;
  description: string;
  message?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
};

export function DataEmptyState({ title, description, message, children, actions }: DataEmptyStateProps) {
  return (
    <SectionCard title={title} description={description}>
      <div className="rounded-2xl border border-amber-600/40 bg-amber-500/5 p-6 text-sm text-amber-100">
        {message ? <p className="text-amber-50">{message}</p> : null}
        {children ? <div className="mt-4 space-y-3 text-amber-100/90">{children}</div> : null}
        {actions ? <div className="mt-4 flex flex-wrap gap-3 text-xs text-white">{actions}</div> : null}
      </div>
    </SectionCard>
  );
}
