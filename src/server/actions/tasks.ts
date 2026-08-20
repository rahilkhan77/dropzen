"use server";

import { mutate } from "@/lib/backend";

export async function createTaskAction(formData: FormData) {
  return mutate("/api/admin/tasks", formData);
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  return mutate(`/api/admin/tasks/${taskId}`, formData, "PATCH");
}

export async function deleteTaskAction(taskId: string) {
  return mutate(`/api/admin/tasks/${taskId}`, undefined, "DELETE");
}

export async function duplicateTaskAction(taskId: string) {
  return mutate(`/api/admin/tasks/${taskId}/duplicate`);
}

export async function startTaskAction(assignmentId: string) {
  return mutate(`/api/employee/assignments/${assignmentId}/start`);
}

export async function submitWorkAction(assignmentId: string, formData: FormData) {
  return mutate(`/api/employee/assignments/${assignmentId}/submit`, formData);
}

export async function requestRevisionAction(assignmentId: string, formData: FormData) {
  return mutate(`/api/admin/assignments/${assignmentId}/review`, withDecision(formData, "REVISION_REQUIRED"));
}

export async function reviewSubmissionAction(
  assignmentId: string,
  decision: "APPROVED" | "REVISION_REQUIRED" | "UNDER_REVIEW",
  feedback?: string,
) {
  const body = new FormData();
  body.set("decision", decision);
  if (feedback) body.set("feedback", feedback);
  return mutate(`/api/admin/assignments/${assignmentId}/review`, body);
}

function withDecision(formData: FormData, decision: string) {
  formData.set("decision", decision);
  return formData;
}
