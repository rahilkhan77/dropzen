import type { Request } from "express";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { writeAudit } from "./audit.js";
import { notify } from "./notify.js";
import { getSettings } from "./settings.js";
import { eachDateKey } from "../utils/dates.js";
import { isWorkingDay } from "../jobs/daily.js";
import { clientIp } from "../middleware/auth.js";

function countLeaveDays(start: string, end: string, workingDays: number[]) {
  return eachDateKey(start, end).filter((key) => isWorkingDay(key, workingDays)).length;
}

export async function applyLeave(
  req: Request,
  data: { leaveTypeId: string; startDate: string; endDate: string; reason: string },
) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Employee profile required");
  if (data.endDate < data.startDate) throw errors.validation("End date cannot be before start date");

  const settings = await getSettings();
  const days = countLeaveDays(data.startDate, data.endDate, settings.workingDays);
  if (days <= 0) throw errors.validation("Selected range has no working days");

  const year = Number(data.startDate.slice(0, 4));
  const balance = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: data.leaveTypeId, year } },
  });
  if (!balance) throw errors.validation("Leave type is not available");
  if (balance.used + balance.pending + days > balance.allocated) {
    throw errors.validation(`Insufficient balance. Remaining: ${balance.allocated - balance.used - balance.pending} day(s)`);
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: data.endDate },
      endDate: { gte: data.startDate },
    },
  });
  if (overlap) throw errors.conflict("You already have a leave request covering these dates");

  const request = await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate: data.startDate,
      endDate: data.endDate,
      days,
      reason: data.reason,
    },
  });
  await prisma.leaveBalance.update({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: data.leaveTypeId, year } },
    data: { pending: { increment: days } },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "LEAVE_REQUESTED",
    entityType: "LeaveRequest",
    entityId: request.id,
    ip: clientIp(req),
  });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: "LEAVE_REQUEST",
      title: "New leave request",
      body: `${req.auth!.name} requested ${days} day(s) of leave`,
      href: "/admin/leave",
    });
  }
  return request;
}

export async function ensureLeaveBalances(employeeId: string) {
  const year = new Date().getFullYear();
  const types = await prisma.leaveType.findMany({ where: { active: true } });
  if (!types.length) return;
  await prisma.leaveBalance.createMany({
    data: types.map((type) => ({
      employeeId,
      leaveTypeId: type.id,
      year,
      allocated: type.daysPerYear,
      used: 0,
      pending: 0,
    })),
    skipDuplicates: true,
  });
}

export async function myLeave(employeeId: string) {
  const year = new Date().getFullYear();
  const [requests, balances, types] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId },
      include: { leaveType: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.leaveBalance.findMany({ where: { employeeId, year }, include: { leaveType: true } }),
    prisma.leaveType.findMany({ where: { active: true } }),
  ]);
  return { requests, balances, types };
}

export async function adminLeave(opts: {
  status?: string;
  employeeId?: string;
  leaveTypeId?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
} = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const where = {
    AND: [
      opts.status ? { status: opts.status as "PENDING" | "APPROVED" | "REJECTED" } : {},
      opts.employeeId ? { employeeId: opts.employeeId } : {},
      opts.leaveTypeId ? { leaveTypeId: opts.leaveTypeId } : {},
      opts.from ? { endDate: { gte: opts.from } } : {},
      opts.to ? { startDate: { lte: opts.to } } : {},
      opts.q
        ? {
            employee: {
              OR: [
                { fullName: { contains: opts.q, mode: "insensitive" as const } },
                { employeeCode: { contains: opts.q, mode: "insensitive" as const } },
                { user: { email: { contains: opts.q, mode: "insensitive" as const } } },
              ],
            },
          }
        : {},
    ],
  };
  const [pending, items, total, employees, types] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: true, leaveType: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.leaveRequest.findMany({
      where,
      include: { employee: true, leaveType: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.leaveRequest.count({ where }),
    prisma.employee.findMany({
      select: { id: true, fullName: true, employeeCode: true },
      orderBy: { fullName: "asc" },
      take: 2000,
    }),
    prisma.leaveType.findMany({ where: { active: true } }),
  ]);
  return { pending, all: items, items, total, page, limit, employees, types };
}

export async function reviewLeave(req: Request, id: string, status: "APPROVED" | "REJECTED", adminNote?: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: true, leaveType: true },
  });
  if (!request) throw errors.notFound("Request not found");
  if (request.status !== "PENDING") throw errors.conflict("Request already reviewed");

  await prisma.leaveRequest.update({
    where: { id },
    data: { status, adminNote: adminNote ?? null, reviewedById: req.auth!.userId },
  });

  const year = Number(request.startDate.slice(0, 4));
  await prisma.leaveBalance.update({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
      },
    },
    data: {
      pending: { decrement: request.days },
      ...(status === "APPROVED" ? { used: { increment: request.days } } : {}),
    },
  });

  if (status === "APPROVED") {
    const settings = await getSettings();
    for (const dateKey of eachDateKey(request.startDate, request.endDate)) {
      if (!isWorkingDay(dateKey, settings.workingDays)) continue;
      await prisma.attendance.upsert({
        where: { employeeId_dateKey: { employeeId: request.employeeId, dateKey } },
        update: { status: "LEAVE" },
        create: { employeeId: request.employeeId, dateKey, status: "LEAVE" },
      });
    }
  }

  await notify({
    userId: request.employee.userId,
    type: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    title: status === "APPROVED" ? "Leave approved" : "Leave rejected",
    body: `${request.leaveType.name}: ${request.startDate} to ${request.endDate}`,
    href: "/leave",
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    entityType: "LeaveRequest",
    entityId: id,
    ip: clientIp(req),
  });
}

export async function adminAddLeave(
  req: Request,
  data: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; reason?: string },
) {
  if (!data.employeeId || !data.leaveTypeId || !data.startDate || !data.endDate) {
    throw errors.validation("All fields are required");
  }
  const settings = await getSettings();
  const days = countLeaveDays(data.startDate, data.endDate, settings.workingDays);
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: data.employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: data.endDate },
      endDate: { gte: data.startDate },
    },
  });
  if (overlap) throw errors.conflict("This employee already has leave covering these dates");
  const type = await prisma.leaveType.findUnique({ where: { id: data.leaveTypeId } });
  const request = await prisma.leaveRequest.create({
    data: {
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate: data.startDate,
      endDate: data.endDate,
      days,
      reason: data.reason || "Added by admin",
      status: "APPROVED",
      reviewedById: req.auth!.userId,
    },
  });
  const year = Number(data.startDate.slice(0, 4));
  await prisma.leaveBalance.upsert({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        year,
      },
    },
    update: { used: { increment: days } },
    create: { employeeId: data.employeeId, leaveTypeId: data.leaveTypeId, year, allocated: type?.daysPerYear ?? 12, used: days },
  });
  for (const dateKey of eachDateKey(data.startDate, data.endDate)) {
    if (!isWorkingDay(dateKey, settings.workingDays)) continue;
    await prisma.attendance.upsert({
      where: { employeeId_dateKey: { employeeId: data.employeeId, dateKey } },
      update: { status: "LEAVE" },
      create: { employeeId: data.employeeId, dateKey, status: "LEAVE" },
    });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: "LEAVE_ADDED",
    entityType: "LeaveRequest",
    entityId: request.id,
    ip: clientIp(req),
  });
  return request;
}
