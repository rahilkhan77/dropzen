import "server-only";

import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/backend";

export type { SessionUser };

export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export async function requireEmployee(): Promise<SessionUser & { employeeId: string }> {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" || !user.employeeId) redirect("/dashboard");
  return user as SessionUser & { employeeId: string };
}

export async function requireApprovedEmployee(): Promise<SessionUser & { employeeId: string }> {
  const user = await requireEmployee();
  if (user.kycStatus !== "APPROVED" || user.status !== "ACTIVE") redirect("/employee/kyc");
  return user;
}
