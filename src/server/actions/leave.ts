"use server";

import { mutate } from "@/lib/backend";

export async function applyLeaveAction(formData: FormData) {
  return mutate("/api/leave", formData);
}

export async function reviewLeaveAction(id: string, status: "APPROVED" | "REJECTED", adminNote?: string) {
  const body = new FormData();
  if (adminNote) body.set("adminNote", adminNote);
  return mutate(`/api/admin/leave/${id}/${status === "APPROVED" ? "approve" : "reject"}`, body);
}

export async function adminAddLeaveAction(formData: FormData) {
  return mutate("/api/admin/leave", formData);
}
