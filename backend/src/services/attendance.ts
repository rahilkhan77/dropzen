import type { Request } from "express";
import type { AttendanceStatus, CorrectionStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { writeAudit } from "./audit.js";
import { getSettings } from "./settings.js";
import { dateKeyInTz } from "../utils/dates.js";
import { attendanceStatusForCheckIn, isWorkingDay } from "../jobs/daily.js";
import { clientIp } from "../middleware/auth.js";

function employeeIdOf(req: Request) {
  if (!req.auth?.employeeId) throw errors.forbidden("Employee profile required");
  return req.auth.employeeId;
}

export async function checkIn(req: Request) {
  const employeeId = employeeIdOf(req);
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  if (!isWorkingDay(today, settings.workingDays)) throw errors.validation("Today is not a working day");

  const leave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: today },
      endDate: { gte: today },
    },
  });
  if (leave) throw errors.validation("You are on approved leave today");

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_dateKey: { employeeId, dateKey: today } },
  });
  if (existing?.checkInAt) throw errors.conflict("Attendance is already marked for today");

  const now = new Date();
  const status = await attendanceStatusForCheckIn(now);
  const row = await prisma.attendance.upsert({
    where: { employeeId_dateKey: { employeeId, dateKey: today } },
    update: { checkInAt: now, status },
    create: { employeeId, dateKey: today, checkInAt: now, status },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ATTENDANCE_MARKED",
    entityType: "Attendance",
    entityId: row.id,
    metadata: { dateKey: today, status },
    ip: clientIp(req),
  });
  return row;
}

export async function checkOut(req: Request) {
  const employeeId = employeeIdOf(req);
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_dateKey: { employeeId, dateKey: today } },
  });
  if (!existing?.checkInAt) throw errors.validation("Check in before checking out");
  if (existing.checkOutAt) throw errors.conflict("Already checked out");
  const now = new Date();
  if (now < existing.checkInAt) throw errors.validation("Check-out cannot occur before check-in");
  const row = await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOutAt: now },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ATTENDANCE_CHECKOUT",
    entityType: "Attendance",
    entityId: row.id,
    ip: clientIp(req),
  });
  return row;
}

export async function todayAttendance(req: Request) {
  const employeeId = employeeIdOf(req);
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  return prisma.attendance.findUnique({
    where: { employeeId_dateKey: { employeeId, dateKey: today } },
  });
}

export async function history(req: Request, take = 60) {
  const employeeId = employeeIdOf(req);
  return prisma.attendance.findMany({
    where: { employeeId },
    orderBy: { dateKey: "desc" },
    take,
  });
}

export async function requestCorrection(
  req: Request,
  data: { dateKey: string; reason: string; proposedStatus?: AttendanceStatus; proposedCheckIn?: string; proposedCheckOut?: string },
) {
  const employeeId = employeeIdOf(req);
  if (!data.dateKey || data.reason.length < 3) throw errors.validation("Date and reason are required");
  const attendance =
    (await prisma.attendance.findUnique({
      where: { employeeId_dateKey: { employeeId, dateKey: data.dateKey } },
    })) ??
    (await prisma.attendance.create({
      data: { employeeId, dateKey: data.dateKey, status: "ABSENT" },
    }));
  const row = await prisma.attendanceCorrection.create({
    data: {
      attendanceId: attendance.id,
      employeeId,
      reason: data.reason,
      proposedStatus: data.proposedStatus || "PRESENT",
      proposedCheckIn: data.proposedCheckIn || null,
      proposedCheckOut: data.proposedCheckOut || null,
    },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ATTENDANCE_CORRECTION_REQUESTED",
    entityType: "Attendance",
    entityId: attendance.id,
    ip: clientIp(req),
  });
  return row;
}

export async function adminList(opts: {
  dateKey?: string;
  range?: string;
  from?: string;
  to?: string;
  employeeId?: string;
  department?: string;
  page?: number;
  limit?: number;
} = {}) {
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  let from = opts.from;
  let to = opts.to;
  if (!from && !to && opts.dateKey) {
    from = to = opts.dateKey;
  } else if (!from && !to) {
    if (opts.range === "week") {
      const d = new Date(`${today}T12:00:00`);
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + mondayOffset);
      from = dateKeyInTz(d, settings.timezone);
      to = today;
    } else if (opts.range === "month") {
      from = `${today.slice(0, 7)}-01`;
      to = today;
    } else {
      from = to = today;
    }
  }
  from = from || today;
  to = to || from;
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const employeeWhere = {
    ...(opts.employeeId ? { id: opts.employeeId } : {}),
    ...(opts.department ? { department: { contains: opts.department, mode: "insensitive" as const } } : {}),
  };
  const where = {
    dateKey: { gte: from, lte: to },
    ...(opts.employeeId || opts.department ? { employee: employeeWhere } : {}),
  };
  const [employees, rows, total, corrections] = await Promise.all([
    prisma.employee.findMany({
      select: { id: true, fullName: true, employeeCode: true, department: true },
      orderBy: { fullName: "asc" },
      take: 2000,
    }),
    prisma.attendance.findMany({
      where,
      include: { employee: { select: { fullName: true, employeeCode: true, department: true } } },
      orderBy: [{ dateKey: "desc" }, { employee: { fullName: "asc" } }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.attendance.count({ where }),
    prisma.attendanceCorrection.findMany({
      where: { status: "PENDING" },
      include: { employee: true, attendance: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    dateKey: from === to ? from : today,
    from,
    to,
    employees,
    rows,
    corrections,
    total,
    page,
    limit,
  };
}

export async function exportCsv(opts: {
  dateKey?: string;
  range?: string;
  from?: string;
  to?: string;
  employeeId?: string;
  department?: string;
}) {
  const data = await adminList({ ...opts, page: 1, limit: 100 });
  const header = ["Employee ID", "Name", "Department", "Date", "Status", "Check-in", "Check-out"];
  const lines = [header.join(",")];
  let page = 1;
  let collected = [...data.rows];
  while (collected.length < data.total && page < 50) {
    page += 1;
    const next = await adminList({ ...opts, page, limit: 100 });
    collected = collected.concat(next.rows);
  }
  for (const row of collected) {
    const cells = [
      row.employee.employeeCode,
      row.employee.fullName,
      row.employee.department ?? "",
      row.dateKey,
      row.status,
      row.checkInAt?.toISOString() ?? "",
      row.checkOutAt?.toISOString() ?? "",
    ].map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export async function adminUpsert(
  req: Request,
  data: {
    employeeId: string;
    dateKey: string;
    status: AttendanceStatus;
    notes?: string;
    checkInAt?: string;
    checkOutAt?: string;
    id?: string;
  },
) {
  if (!data.employeeId || !data.dateKey || !data.status) {
    throw errors.validation("Employee, date and status are required");
  }
  const row = await prisma.attendance.upsert({
    where: { employeeId_dateKey: { employeeId: data.employeeId, dateKey: data.dateKey } },
    update: {
      status: data.status,
      notes: data.notes || null,
      checkInAt: data.checkInAt ? new Date(data.checkInAt) : undefined,
      checkOutAt: data.checkOutAt ? new Date(data.checkOutAt) : undefined,
      editedById: req.auth!.userId,
    },
    create: {
      employeeId: data.employeeId,
      dateKey: data.dateKey,
      status: data.status,
      notes: data.notes || null,
      checkInAt: data.checkInAt ? new Date(data.checkInAt) : null,
      checkOutAt: data.checkOutAt ? new Date(data.checkOutAt) : null,
      editedById: req.auth!.userId,
    },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ATTENDANCE_CORRECTED",
    entityType: "Attendance",
    entityId: row.id,
    metadata: { employeeId: data.employeeId, dateKey: data.dateKey, status: data.status },
    ip: clientIp(req),
  });
  return row;
}

export async function reviewCorrection(req: Request, id: string, status: CorrectionStatus, note?: string) {
  const row = await prisma.attendanceCorrection.findUnique({
    where: { id },
    include: { attendance: true },
  });
  if (!row) throw errors.notFound("Request not found");
  await prisma.attendanceCorrection.update({
    where: { id },
    data: { status, adminNote: note ?? null, reviewedById: req.auth!.userId },
  });
  if (status === "APPROVED") {
    await prisma.attendance.update({
      where: { id: row.attendanceId },
      data: {
        status: row.proposedStatus,
        checkInAt: row.proposedCheckIn ? new Date(row.proposedCheckIn) : row.attendance.checkInAt,
        checkOutAt: row.proposedCheckOut ? new Date(row.proposedCheckOut) : row.attendance.checkOutAt,
        editedById: req.auth!.userId,
      },
    });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: status === "APPROVED" ? "ATTENDANCE_CORRECTION_APPROVED" : "ATTENDANCE_CORRECTION_REJECTED",
    entityType: "AttendanceCorrection",
    entityId: id,
    ip: clientIp(req),
  });
}
