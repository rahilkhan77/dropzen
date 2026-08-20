"use server";

import { mutate } from "@/lib/backend";

export async function markAttendanceAction() {
  return mutate("/api/attendance/check-in");
}

export async function checkoutAttendanceAction() {
  return mutate("/api/attendance/check-out");
}

export async function requestAttendanceCorrectionAction(formData: FormData) {
  return mutate("/api/attendance/correction-request", formData);
}

export async function adminUpsertAttendanceAction(formData: FormData) {
  return mutate("/api/admin/attendance", formData);
}

export async function reviewCorrectionAction(id: string, status: "APPROVED" | "REJECTED", note?: string) {
  const body = new FormData();
  body.set("status", status);
  if (note) body.set("note", note);
  return mutate(`/api/admin/attendance/corrections/${id}/review`, body);
}
