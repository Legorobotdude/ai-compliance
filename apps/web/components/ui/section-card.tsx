import clsx from "clsx";
import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ title, description, actions, children, className }: SectionCardProps) {
  return (
    <section className={clsx("card space-y-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="section-title">{title}</p>
          {description ? <p className="text-sm text-slate-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2 text-sm text-slate-400">{actions}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
