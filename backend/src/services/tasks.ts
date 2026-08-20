import type { Request } from "express";
import type { AssignmentStatus, TaskPriority } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { writeAudit } from "./audit.js";
import { notify } from "./notify.js";
import { storeBuffer } from "./storage.js";
import { getSettings } from "./settings.js";
import { EmailService } from "./email.js";
import { env } from "../config/env.js";
import { paged } from "../utils/pagination.js";
import { clientIp } from "../middleware/auth.js";
import type { taskSchema } from "../validators/index.js";
import type { z } from "zod";

async function saveTaskFiles(
  taskId: string,
  files: { template?: Express.Multer.File; references?: Express.Multer.File[] },
  uploadedById: string,
  employeeIds: string[],
) {
  if (files.template) {
    const file = await storeBuffer({
      buffer: files.template.buffer,
      originalName: files.template.originalname,
      mimeType: files.template.mimetype,
      kind: "excel",
      uploadedById,
      ownerType: "TASK",
      relatedId: taskId,
      employeeId: employeeIds[0],
    });
    await prisma.taskFile.create({ data: { taskId, fileId: file.id, kind: "TEMPLATE" } });
  }
  for (const ref of files.references ?? []) {
    const file = await storeBuffer({
      buffer: ref.buffer,
      originalName: ref.originalname,
      mimeType: ref.mimetype,
      kind: "document",
      uploadedById,
      ownerType: "TASK",
      relatedId: taskId,
      employeeId: employeeIds[0],
    });
    await prisma.taskFile.create({ data: { taskId, fileId: file.id, kind: "REFERENCE" } });
  }
}

const taskInclude = {
  createdBy: { select: { email: true, username: true } },
  files: { include: { file: true } },
  assignments: {
    include: {
      employee: true,
      submissions: {
        include: { versions: { include: { file: true }, orderBy: { version: "asc" as const } } },
        orderBy: { createdAt: "desc" as const },
      },
    },
  },
};

export async function listAdminTasks(opts: { q?: string; employeeId?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const where = {
    AND: [
      opts.employeeId ? { assignments: { some: { employeeId: opts.employeeId } } } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" as const } },
              {
                assignments: {
                  some: { employee: { fullName: { contains: opts.q, mode: "insensitive" as const } } },
                },
              },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);
  return paged(items, total, page, limit);
}

export async function getTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) throw errors.notFound("Task not found");
  return task;
}

export async function createTask(
  req: Request,
  data: z.infer<typeof taskSchema>,
  files: { template?: Express.Multer.File; references?: Express.Multer.File[] },
) {
  const hours = data.estimatedHours ? Number(data.estimatedHours) : null;
  const notes = data.notes || data.description;
  let recurringId: string | undefined;
  if (data.recurring) {
    const recurring = await prisma.recurringTask.create({
      data: {
        title: data.title,
        instructions: data.instructions,
        priority: data.priority as TaskPriority,
        estimatedHours: hours,
        notes,
        employeeIds: JSON.stringify(data.employeeIds),
        frequency: data.frequency || "DAILY",
        createdById: req.auth!.userId,
        lastGeneratedOn: data.dateKey,
      },
    });
    recurringId = recurring.id;
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      instructions: data.instructions,
      dateKey: data.dateKey,
      deadline: new Date(data.deadline),
      priority: data.priority as TaskPriority,
      estimatedHours: hours,
      notes,
      createdById: req.auth!.userId,
      recurringId,
      assignments: { create: data.employeeIds.map((employeeId) => ({ employeeId })) },
    },
  });

  await saveTaskFiles(task.id, files, req.auth!.userId, data.employeeIds);

  const employees = await prisma.employee.findMany({
    where: { id: { in: data.employeeIds } },
    select: { userId: true, fullName: true, user: { select: { email: true } } },
  });
  for (const emp of employees) {
    await notify({
      userId: emp.userId,
      type: "TASK_ASSIGNED",
      title: `New task assigned: ${data.title}`,
      body: data.instructions.slice(0, 240),
      href: `/tasks/${task.id}`,
    });
    await EmailService.sendTaskAssigned({
      to: emp.user.email,
      name: emp.fullName,
      title: data.title,
      taskUrl: `${env.FRONTEND_URL}/tasks/${task.id}`,
    });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_CREATED",
    entityType: "Task",
    entityId: task.id,
    metadata: { employeeCount: data.employeeIds.length, recurring: Boolean(recurringId) },
    ip: clientIp(req),
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_ASSIGNED",
    entityType: "Task",
    entityId: task.id,
    metadata: { employeeIds: data.employeeIds },
    ip: clientIp(req),
  });
  return task;
}

export async function updateTask(
  req: Request,
  taskId: string,
  data: Partial<z.infer<typeof taskSchema>>,
  files: { template?: Express.Multer.File; references?: Express.Multer.File[] },
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw errors.notFound("Task not found");
  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: data.title || task.title,
      instructions: data.instructions || task.instructions,
      dateKey: data.dateKey || task.dateKey,
      deadline: data.deadline ? new Date(data.deadline) : task.deadline,
      priority: (data.priority as TaskPriority) || task.priority,
      estimatedHours: data.estimatedHours ? Number(data.estimatedHours) : task.estimatedHours,
      notes: data.notes ?? task.notes,
    },
  });
  for (const employeeId of data.employeeIds ?? []) {
    await prisma.taskAssignment.upsert({
      where: { taskId_employeeId: { taskId, employeeId } },
      update: {},
      create: { taskId, employeeId },
    });
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (emp) {
      await notify({
        userId: emp.userId,
        type: "TASK_ASSIGNED",
        title: "Task assigned",
        body: data.title || task.title,
        href: `/tasks/${taskId}`,
      });
    }
  }
  await saveTaskFiles(taskId, files, req.auth!.userId, data.employeeIds ?? []);
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_UPDATED",
    entityType: "Task",
    entityId: taskId,
    ip: clientIp(req),
  });
}

export async function assignTask(req: Request, taskId: string, employeeIds: string[]) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw errors.notFound("Task not found");
  for (const employeeId of employeeIds) {
    await prisma.taskAssignment.upsert({
      where: { taskId_employeeId: { taskId, employeeId } },
      update: {},
      create: { taskId, employeeId },
    });
  }
  const assigned = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { userId: true },
  });
  for (const emp of assigned) {
    await notify({
      userId: emp.userId,
      type: "TASK_ASSIGNED",
      title: `New task assigned: ${task.title}`,
      body: task.instructions.slice(0, 240),
      href: `/tasks/${taskId}`,
    });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_ASSIGNED",
    entityType: "Task",
    entityId: taskId,
    metadata: { employeeIds },
    ip: clientIp(req),
  });
}

export async function deleteTask(req: Request, taskId: string) {
  await prisma.task.delete({ where: { id: taskId } });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_DELETED",
    entityType: "Task",
    entityId: taskId,
    ip: clientIp(req),
  });
}

export async function duplicateTask(req: Request, taskId: string) {
  const settings = await getSettings();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignments: true, files: true },
  });
  if (!task) throw errors.notFound("Task not found");
  const copy = await prisma.task.create({
    data: {
      title: `${task.title} (copy)`,
      instructions: task.instructions,
      dateKey: task.dateKey,
      deadline: task.deadline,
      priority: task.priority,
      estimatedHours: task.estimatedHours ?? settings.defaultTaskHours,
      notes: task.notes,
      createdById: req.auth!.userId,
      assignments: { create: task.assignments.map((a) => ({ employeeId: a.employeeId })) },
    },
  });
  for (const file of task.files) {
    await prisma.taskFile.create({ data: { taskId: copy.id, fileId: file.fileId, kind: file.kind } });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_DUPLICATED",
    entityType: "Task",
    entityId: copy.id,
    ip: clientIp(req),
  });
  return copy;
}

export async function employeeTasks(employeeId: string) {
  return prisma.taskAssignment.findMany({
    where: { employeeId },
    include: {
      task: { include: { files: { include: { file: true } } } },
      submissions: {
        include: { versions: { include: { file: true }, orderBy: { version: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { task: { deadline: "asc" } },
  });
}

export async function employeeTask(employeeId: string, taskId: string) {
  const assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_employeeId: { taskId, employeeId } },
    include: {
      task: { include: { files: { include: { file: true } } } },
      submissions: {
        include: { versions: { include: { file: true }, orderBy: { version: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!assignment) throw errors.notFound("Task not found");
  return assignment;
}

export async function startTask(req: Request, assignmentId: string) {
  const assignment = await prisma.taskAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.employeeId !== req.auth!.employeeId) throw errors.notFound("Assignment not found");
  if (assignment.status === "ASSIGNED" || assignment.status === "OVERDUE") {
    await prisma.taskAssignment.update({ where: { id: assignmentId }, data: { status: "IN_PROGRESS" } });
  }
}

export async function submitWork(req: Request, assignmentId: string, file: Express.Multer.File | undefined, comments: string) {
  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentId },
    include: { task: true, submissions: { include: { versions: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!assignment || assignment.employeeId !== req.auth!.employeeId) throw errors.notFound("Assignment not found");
  if (!file) throw errors.validation("Upload your completed Excel/CSV file");

  let submission = assignment.submissions[0];
  if (!submission) {
    submission = await prisma.taskSubmission.create({
      data: { assignmentId, comments, status: "SUBMITTED" },
      include: { versions: true },
    });
  } else {
    submission = await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: { comments, status: "SUBMITTED", feedback: null },
      include: { versions: true },
    });
  }

  const saved = await storeBuffer({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    kind: "excel",
    uploadedById: req.auth!.userId,
    ownerType: "SUBMISSION",
    relatedId: submission.id,
    employeeId: req.auth!.employeeId,
  });
  await prisma.submissionVersion.create({
    data: {
      submissionId: submission.id,
      version: (submission.versions?.length ?? 0) + 1,
      fileId: saved.id,
      comments,
    },
  });
  await prisma.taskAssignment.update({
    where: { id: assignmentId },
    data: { status: "SUBMITTED" },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "TASK_SUBMITTED",
    entityType: "TaskSubmission",
    entityId: submission.id,
    metadata: { taskId: assignment.taskId },
    ip: clientIp(req),
  });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: "TASK_SUBMITTED",
      title: "Work submitted",
      body: `${req.auth!.name} submitted ${assignment.task.title}`,
      href: `/admin/tasks/${assignment.taskId}`,
    });
  }
  return submission;
}

export async function listSubmissions() {
  return prisma.taskSubmission.findMany({
    include: {
      versions: { include: { file: true }, orderBy: { version: "asc" } },
      assignment: { include: { employee: true, task: true } },
      reviewedBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSubmission(id: string) {
  const row = await prisma.taskSubmission.findUnique({
    where: { id },
    include: {
      versions: { include: { file: true }, orderBy: { version: "asc" } },
      assignment: { include: { employee: true, task: true } },
    },
  });
  if (!row) throw errors.notFound("Submission not found");
  return row;
}

export async function reviewSubmission(
  req: Request,
  assignmentOrSubmissionId: string,
  decision: "APPROVED" | "REVISION_REQUIRED" | "UNDER_REVIEW",
  feedback?: string,
) {
  const submissionInclude = { include: { versions: true }, orderBy: { createdAt: "desc" as const } };
  let assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentOrSubmissionId },
    include: { employee: true, task: true, submissions: submissionInclude },
  });
  if (!assignment) {
    const sub = await prisma.taskSubmission.findUnique({
      where: { id: assignmentOrSubmissionId },
      include: { assignment: { include: { employee: true, task: true, submissions: submissionInclude } } },
    });
    if (!sub) throw errors.notFound("Assignment not found");
    assignment = { ...sub.assignment, submissions: sub.assignment.submissions };
  }
  const nextStatus: AssignmentStatus = decision === "APPROVED" ? "COMPLETED" : decision;
  await prisma.taskAssignment.update({ where: { id: assignment.id }, data: { status: nextStatus } });
  const latest = assignment.submissions[0];
  if (latest) {
    await prisma.taskSubmission.update({
      where: { id: latest.id },
      data: { status: nextStatus, feedback: feedback ?? null, reviewedById: req.auth!.userId },
    });
  }
  await notify({
    userId: assignment.employee.userId,
    type: decision === "APPROVED" ? "TASK_APPROVED" : "TASK_REVISION",
    title: decision === "APPROVED" ? "Submission approved" : "Revision requested",
    body: feedback || assignment.task.title,
    href: `/tasks/${assignment.taskId}`,
  });
  if (decision === "REVISION_REQUIRED") {
    const emp = await prisma.employee.findUnique({
      where: { id: assignment.employeeId },
      include: { user: true },
    });
    if (emp) {
      await EmailService.sendTaskRevision({
        to: emp.user.email,
        name: emp.fullName,
        title: assignment.task.title,
        feedback: feedback || "Please revise and resubmit.",
        taskUrl: `${env.FRONTEND_URL}/tasks/${assignment.taskId}`,
      });
    }
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: decision === "APPROVED" ? "TASK_APPROVED" : "TASK_REVISION_REQUESTED",
    entityType: "TaskAssignment",
    entityId: assignment.id,
    ip: clientIp(req),
  });
}
