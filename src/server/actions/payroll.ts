"use server";

import { mutate } from "@/lib/backend";

export async function upsertBankDetailsAction(formData: FormData) {
  return mutate("/api/employee/bank", formData, "PUT");
}

export async function verifyBankDetailsAction(employeeId: string, status: "VERIFIED" | "REJECTED", reason?: string) {
  const body = new FormData();
  body.set("status", status);
  if (reason) body.set("reason", reason);
  return mutate(`/api/admin/bank/${employeeId}/verify`, body);
}

export async function upsertSalaryAction(formData: FormData) {
  return mutate("/api/admin/payroll", formData);
}
