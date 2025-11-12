"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type UserRole = "viewer" | "analyst" | "admin";

type RoleContextValue = {
  role: UserRole;
  setRole: (role: UserRole) => void;
};

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function Providers({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("analyst");
  const value = useMemo(() => ({ role, setRole }), [role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error("useRole must be used within Providers");
  }
  return ctx;
}
