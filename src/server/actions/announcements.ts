"use server";

import { mutate } from "@/lib/backend";

export async function createAnnouncementAction(formData: FormData) {
  return mutate("/api/admin/announcements", formData);
}

export async function deleteAnnouncementAction(id: string) {
  return mutate(`/api/admin/announcements/${id}`, undefined, "DELETE");
}
