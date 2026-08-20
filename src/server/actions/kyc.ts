"use server";

import { mutate } from "@/lib/backend";

export async function saveKycAction(formData: FormData) {
  return mutate("/api/employee/kyc", formData, "PATCH");
}

export async function submitKycAction() {
  return mutate("/api/employee/kyc/submit");
}

export async function uploadKycDocumentAction(formData: FormData) {
  return mutate("/api/employee/kyc/documents", formData);
}

export async function approveKycAction(employeeId: string) {
  return mutate(`/api/admin/kyc/${employeeId}/approve`);
}

export async function rejectKycAction(employeeId: string, formData: FormData) {
  return mutate(`/api/admin/kyc/${employeeId}/reject`, formData);
}

export async function requestKycCorrectionAction(employeeId: string, formData: FormData) {
  return mutate(`/api/admin/kyc/${employeeId}/correction`, formData);
}
