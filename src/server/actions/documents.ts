"use server";

import { mutate } from "@/lib/backend";

export async function uploadDocumentAction(formData: FormData) {
  return mutate("/api/documents", formData);
}

export async function employeeUploadDocumentAction(formData: FormData) {
  return mutate("/api/documents", formData);
}
