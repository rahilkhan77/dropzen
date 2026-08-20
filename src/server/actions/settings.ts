"use server";

import { mutate } from "@/lib/backend";

export async function updateSettingsAction(formData: FormData) {
  return mutate("/api/admin/settings", formData, "PATCH");
}

export async function upsertLeaveTypeAction(formData: FormData) {
  return mutate("/api/admin/leave-types", formData);
}
