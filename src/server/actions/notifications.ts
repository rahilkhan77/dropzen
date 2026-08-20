"use server";

import { mutate } from "@/lib/backend";

export async function markNotificationReadAction(id: string) {
  return mutate(`/api/notifications/${id}/read`, undefined, "PATCH");
}

export async function markAllNotificationsReadAction() {
  return mutate("/api/notifications/read-all");
}
