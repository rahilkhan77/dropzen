"use server";

import { mutate } from "@/lib/backend";

export async function updateOwnProfileAction(formData: FormData) {
  return mutate("/api/employee/profile", formData, "PATCH");
}

export async function updateOwnProfileFromUserAction(formData: FormData) {
  return updateOwnProfileAction(formData);
}
