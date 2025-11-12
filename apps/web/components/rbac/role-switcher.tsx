"use client";

import { useRole } from "@/app/providers";

const options = [
  { value: "viewer", label: "Viewer" },
  { value: "analyst", label: "Analyst" },
  { value: "admin", label: "Admin" }
] as const;

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  return (
    <label className="flex items-center gap-3 text-sm text-slate-300">
      Role
      <select
        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 focus:border-brand-400 focus:outline-none"
        value={role}
        onChange={(event) => setRole(event.currentTarget.value as (typeof options)[number]["value"])}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
