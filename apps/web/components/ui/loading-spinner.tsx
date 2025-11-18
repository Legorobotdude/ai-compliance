import clsx from "clsx";

type LoadingSpinnerProps = {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
};

const sizeClassNames: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-6 w-6 border-[3px]"
};

export function LoadingSpinner({ size = "md", label, className }: LoadingSpinnerProps) {
  return (
    <div className={clsx("flex items-center gap-3 text-slate-400", className)}>
      <span
        className={clsx(
          "inline-flex animate-spin rounded-full border-slate-600/70 border-t-transparent",
          sizeClassNames[size]
        )}
        role="status"
        aria-label={label ?? "Loading"}
      />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
