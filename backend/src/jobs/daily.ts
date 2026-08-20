import type { AssignmentStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { getSettings } from "../services/settings.js";
import { dateKeyInTz, hmToMinutes, timeHmInTz, parseJson } from "../utils/dates.js";
import { notify } from "../services/notify.js";
import { EmailService } from "../services/email.js";
import { env } from "../config/env.js";

const TERMINAL: AssignmentStatus[] = ["APPROVED", "COMPLETED"];

export async function runDailyJobs() {
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  await generateRecurringTasks(today, settings.workingDays);
  await markOverdueAssignments();
  await remindUpcomingDeadlines(settings.notifyDeadlineHours);
}

function daysBetween(a: string, b: string) {
  const start = new Date(`${a}T12:00:00`);
  const end = new Date(`${b}T12:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function shouldGenerate(
  frequency: "DAILY" | "WEEKLY" | "MONTHLY",
  lastGeneratedOn: string | null,
  today: string,
  workingDays: number[],
) {
  if (lastGeneratedOn === today) return false;
  if (!isWorkingDay(today, workingDays)) return false;
  if (!lastGeneratedOn) {
    if (frequency === "MONTHLY") return Number(today.slice(8, 10)) <= 3;
    return true;
  }
  if (frequency === "WEEKLY") return daysBetween(lastGeneratedOn, today) >= 7;
  if (frequency === "MONTHLY") {
    return lastGeneratedOn.slice(0, 7) !== today.slice(0, 7) && Number(today.slice(8, 10)) <= 3;
  }
  return true;
}

async function generateRecurringTasks(today: string, workingDays: number[]) {
  const templates = await prisma.recurringTask.findMany({ where: { active: true } });
  if (!templates.length) return;
  const settings = await getSettings();
  const [h, m] = settings.workEnd.split(":").map(Number);
  const deadline = new Date(`${today}T00:00:00`);
  deadline.setHours(h, m, 0, 0);

  for (const template of templates) {
    if (!shouldGenerate(template.frequency, template.lastGeneratedOn, today, workingDays)) continue;
    const employeeIds = parseJson<string[]>(template.employeeIds, []);
    if (!employeeIds.length) continue;

    const existing = await prisma.task.findFirst({
      where: { recurringId: template.id, dateKey: today },
    });
    if (existing) {
      await prisma.recurringTask.update({ where: { id: template.id }, data: { lastGeneratedOn: today } });
      continue;
    }

    try {
      const task = await prisma.task.create({
        data: {
          title: template.title,
          instructions: template.instructions,
          dateKey: today,
          deadline,
          priority: template.priority,
          estimatedHours: template.estimatedHours,
          notes: template.notes,
          createdById: template.createdById,
          recurringId: template.id,
          assignments: { create: employeeIds.map((employeeId) => ({ employeeId })) },
        },
      });
      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { userId: true, fullName: true, user: { select: { email: true } } },
      });
      for (const emp of employees) {
        await notify({
          userId: emp.userId,
          type: "TASK_ASSIGNED",
          title: "New recurring task assigned",
          body: `${template.title} is due today.`,
          href: `/tasks/${task.id}`,
        });
        await EmailService.sendTaskAssigned({
          to: emp.user.email,
          name: emp.fullName,
          title: template.title,
          taskUrl: `${env.FRONTEND_URL}/tasks/${task.id}`,
        });
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
    }
    await prisma.recurringTask.update({
      where: { id: template.id },
      data: { lastGeneratedOn: today },
    });
  }
}

async function markOverdueAssignments() {
  const now = new Date();
  const open = await prisma.taskAssignment.findMany({
    where: {
      status: { notIn: [...TERMINAL, "SUBMITTED", "UNDER_REVIEW", "OVERDUE"] },
      task: { deadline: { lt: now } },
    },
  });
  for (const row of open) {
    await prisma.taskAssignment.update({ where: { id: row.id }, data: { status: "OVERDUE" } });
  }
}

async function remindUpcomingDeadlines(hours: number) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  const due = await prisma.taskAssignment.findMany({
    where: {
      status: { in: ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUIRED", "OVERDUE"] },
      task: { deadline: { lte: until, gte: new Date() } },
    },
    include: { task: true, employee: true },
  });
  for (const row of due) {
    const already = await prisma.notification.findFirst({
      where: {
        userId: row.employee.userId,
        type: "TASK_DEADLINE",
        href: `/tasks/${row.taskId}`,
        createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      },
    });
    if (already) continue;
    await notify({
      userId: row.employee.userId,
      type: "TASK_DEADLINE",
      title: "Task deadline approaching",
      body: `${row.task.title} is due soon.`,
      href: `/tasks/${row.taskId}`,
    });
  }
}

export async function attendanceStatusForCheckIn(checkIn: Date) {
  const settings = await getSettings();
  const hm = timeHmInTz(checkIn, settings.timezone);
  const minutes = hmToMinutes(hm);
  if (minutes >= hmToMinutes(settings.halfDayAfter)) return "HALF_DAY" as const;
  if (minutes >= hmToMinutes(settings.lateAfter)) return "LATE" as const;
  return "PRESENT" as const;
}

export function isWorkingDay(dateKey: string, workingDays: number[]) {
  return workingDays.includes(new Date(`${dateKey}T12:00:00`).getDay());
}
