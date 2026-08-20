"use server";

import { mutate } from "@/lib/backend";
import type { ActionResult } from "@/lib/action";

export async function createEmployeeAction(formData: FormData) {
  return mutate("/api/admin/employees", formData);
}

export async function updateEmployeeAdminAction(employeeId: string, formData: FormData) {
  return mutate(`/api/admin/employees/${employeeId}`, formData, "PATCH");
}

export async function setEmployeeStatusAction(
  employeeId: string,
  status: "ACTIVE" | "SUSPENDED" | "DISABLED",
) {
  const body = new FormData();
  body.set("status", status);
  return mutate(`/api/admin/employees/${employeeId}/status`, body, "PATCH");
}

export async function deleteEmployeeAction(employeeId: string) {
  return mutate(`/api/admin/employees/${employeeId}`, undefined, "DELETE");
}

export async function adminResetPasswordAction(employeeId: string) {
  return mutate(`/api/admin/employees/${employeeId}/reset-password`);
}

export async function resendInvitationAction(employeeId: string) {
  return mutate(`/api/admin/employees/${employeeId}/resend-invitation`);
}
