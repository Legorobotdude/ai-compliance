export type BomStatus = "COMPLIANT" | "MISSING" | "EXPIRED" | "OVER_LIMIT";

const palette: Record<BomStatus, { bg: string; text: string }> = {
  COMPLIANT: { bg: "bg-green-500/20", text: "text-green-300" },
  MISSING: { bg: "bg-yellow-500/20", text: "text-yellow-200" },
  EXPIRED: { bg: "bg-orange-500/20", text: "text-orange-200" },
  OVER_LIMIT: { bg: "bg-red-500/20", text: "text-red-200" }
};

export function statusClass(status: BomStatus) {
  const cfg = palette[status] ?? palette.COMPLIANT;
  return `${cfg.bg} ${cfg.text} text-xs font-semibold px-2 py-1 rounded-full`;
}
