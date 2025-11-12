"use client";

import type { ReactNode } from "react";

import { useRole, type UserRole } from "@/app/providers";

type RoleGateProps = {
  allow: UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
};

export function RoleGate({ allow, fallback = null, children }: RoleGateProps) {
  const { role } = useRole();
  if (!allow.includes(role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
