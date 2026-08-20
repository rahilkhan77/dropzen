"use server";

import { mutate } from "@/lib/backend";
import type { ActionResult } from "@/lib/action";

export async function loginAction(formData: FormData): Promise<ActionResult> {
  return mutate("/api/auth/login", formData);
}

export async function logoutAction() {
  await mutate("/api/auth/logout");
}

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  return mutate("/api/auth/change-password", formData);
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult<{ resetUrl?: string }>> {
  return mutate("/api/auth/forgot-password", formData) as Promise<ActionResult<{ resetUrl?: string }>>;
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  return mutate("/api/auth/reset-password", formData);
}

export async function activateInviteAction(formData: FormData): Promise<ActionResult> {
  return mutate("/api/auth/activate", formData);
}
