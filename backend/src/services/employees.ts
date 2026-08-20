import type { Request } from "express";
import type { UserStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { hashPassword, randomToken } from "../utils/crypto.js";
import { writeAudit } from "./audit.js";
import { nextEmployeeCode } from "./settings.js";
import { storeBuffer } from "./storage.js";
import { clientIp } from "../middleware/auth.js";
import { issueInvitation } from "./invitation.js";
import { forgotPassword } from "./auth.js";
import type { employeeCreateSchema, employeeUpdateSchema, profileSchema } from "../validators/index.js";
import type { z } from "zod";

function empInclude() {
  return {
    user: {
      select: {
        id: true,
        email: true,
        username: true,
        status: true,
        role: true,
        lastLoginAt: true,
        mustChangePassword: true,
      },
    },
    photo: true,
    kycReviewedBy: { select: { email: true, username: true } },
    bankDetails: {
      select: {
        id: true,
        accountHolderName: true,
        bankName: true,
        ifsc: true,
        upiId: true,
        accountLast4: true,
        panLast4: true,
        status: true,
        rejectionReason: true,
      },
    },
  } as const;
}

export async function listEmployees(q: string, page: number, take = 25) {
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { employeeCode: { contains: q, mode: "insensitive" as const } },
          { department: { contains: q, mode: "insensitive" as const } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: empInclude(),
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.employee.count({ where }),
  ]);
  return { items, total, page, limit: take, take };
}

export async function listEmployeeOptions() {
  return prisma.employee.findMany({
    where: { user: { status: { in: ["ACTIVE", "INVITED"] } } },
    select: { id: true, fullName: true, employeeCode: true, department: true },
    orderBy: { fullName: "asc" },
    take: 2000,
  });
}

export async function getEmployee(id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      ...empInclude(),
      salaryRecords: { orderBy: [{ year: "desc" }, { month: "desc" }] },
      leaveBalances: { include: { leaveType: true } },
      documents: { include: { file: true }, orderBy: { createdAt: "desc" } },
      attendance: { orderBy: { dateKey: "desc" }, take: 20 },
      assignments: {
        include: { task: true, submissions: { include: { versions: { include: { file: true } } } } },
        take: 20,
        orderBy: { createdAt: "desc" },
      },
      leaveRequests: { include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!employee) throw errors.notFound("Employee not found");
  const [logs, invitation] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: employee.userId }, { entityId: employee.id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.invitation.findFirst({
      where: { userId: employee.userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, expiresAt: true, usedAt: true, createdAt: true },
    }),
  ]);
  return {
    ...employee,
    panEnc: undefined,
    govIdNumberEnc: undefined,
    salaryRecords: employee.salaryRecords.map((s) => ({ ...s, amount: s.netSalary })),
    logs,
    invitation: invitation
      ? {
          status: invitation.usedAt
            ? "ACCEPTED"
            : invitation.expiresAt < new Date()
              ? "EXPIRED"
              : "PENDING",
          expiresAt: invitation.expiresAt,
          usedAt: invitation.usedAt,
          sentAt: invitation.createdAt,
        }
      : null,
  };
}

export async function createEmployee(req: Request, data: z.infer<typeof employeeCreateSchema>) {
  const emailLocal = data.email.split("@")[0] ?? "employee";
  let username = (data.username || emailLocal).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (username.length < 3) username = `emp${Date.now().toString().slice(-8)}`;

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailTaken) throw errors.conflict("Email or username is already in use");

  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? username : `${username}${i + 1}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate } });
    if (!taken) {
      username = candidate;
      break;
    }
    if (i === 7) throw errors.conflict("Email or username is already in use");
  }

  let code = data.employeeCode?.trim().toUpperCase();
  if (code) {
    const takenCode = await prisma.employee.findUnique({ where: { employeeCode: code } });
    if (takenCode) throw errors.conflict("Employee ID is already in use");
  } else {
    code = await nextEmployeeCode();
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username,
      passwordHash: await hashPassword(randomToken(24)),
      role: "EMPLOYEE",
      status: "INVITED",
      mustChangePassword: false,
      employee: {
        create: {
          employeeCode: code,
          fullName: data.fullName,
          phone: data.phone,
          joiningDate: new Date(`${data.joiningDate}T00:00:00`),
          department: data.department,
          designation: data.designation,
          dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00`) : null,
          address: data.address,
          emergencyName: data.emergencyName,
          emergencyPhone: data.emergencyPhone,
          baseSalary: data.baseSalary ?? null,
          kycStatus: "NOT_STARTED",
        },
      },
    },
    include: { employee: true },
  });

  await writeAudit({
    actorId: req.auth!.userId,
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: user.employee?.id,
    metadata: { email: user.email, code },
    ip: clientIp(req),
  });

  const invite = await issueInvitation({
    req,
    userId: user.id,
    employeeId: user.employee!.id,
    email: user.email,
    name: data.fullName,
    action: "INVITATION_SENT",
  });

  return { id: user.employee!.id, code, email: user.email, inviteUrl: invite.inviteUrl };
}

export async function resendInvitation(req: Request, employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!employee) throw errors.notFound("Employee not found");
  if (employee.user.role !== "EMPLOYEE") throw errors.forbidden();
  if (employee.user.status === "DISABLED") throw errors.forbidden("Disabled accounts cannot be invited.");
  if (employee.user.status === "ACTIVE") {
    throw errors.conflict("This employee has already activated their account.");
  }
  const invite = await issueInvitation({
    req,
    userId: employee.userId,
    employeeId: employee.id,
    email: employee.user.email,
    name: employee.fullName,
    action: "INVITATION_RESENT",
  });
  return { inviteUrl: invite.inviteUrl };
}

export async function updateEmployee(req: Request, employeeId: string, data: z.infer<typeof employeeUpdateSchema>) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee) throw errors.notFound("Employee not found");

  if (data.email && data.email !== employee.user.email) {
    const taken = await prisma.user.findFirst({ where: { email: data.email, NOT: { id: employee.userId } } });
    if (taken) throw errors.conflict("Email is already in use");
  }

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employeeId },
      data: {
        fullName: data.fullName ?? employee.fullName,
        phone: data.phone === undefined ? employee.phone : data.phone,
        department: data.department ?? employee.department,
        designation: data.designation ?? employee.designation,
        joiningDate: data.joiningDate ? new Date(`${data.joiningDate}T00:00:00`) : employee.joiningDate,
        skills: data.skills
          ? JSON.stringify(data.skills.split(",").map((s) => s.trim()).filter(Boolean))
          : employee.skills,
        dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00`) : employee.dateOfBirth,
        address: data.address === undefined ? employee.address : data.address,
        emergencyName: data.emergencyName === undefined ? employee.emergencyName : data.emergencyName,
        emergencyPhone: data.emergencyPhone === undefined ? employee.emergencyPhone : data.emergencyPhone,
        baseSalary: data.baseSalary === undefined ? employee.baseSalary : data.baseSalary,
      },
    }),
    prisma.user.update({
      where: { id: employee.userId },
      data: { email: data.email ?? employee.user.email },
    }),
  ]);

  await writeAudit({
    actorId: req.auth!.userId,
    action: "EMPLOYEE_UPDATED",
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
}

function statusAudit(status: UserStatus) {
  if (status === "SUSPENDED") return "EMPLOYEE_SUSPENDED";
  if (status === "DISABLED") return "EMPLOYEE_DISABLED";
  if (status === "INVITED") return "EMPLOYEE_INVITED";
  return "EMPLOYEE_ENABLED";
}

export async function setEmployeeStatus(req: Request, employeeId: string, status: UserStatus) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: { include: { invitations: true } } },
  });
  if (!employee) throw errors.notFound("Employee not found");
  if (!["ACTIVE", "SUSPENDED", "DISABLED", "INVITED"].includes(status)) {
    throw errors.validation("Invalid status");
  }

  let next: UserStatus = status;
  if (status === "ACTIVE") {
    const activated = employee.user.invitations.some((row) => row.usedAt) || Boolean(employee.user.lastLoginAt);
    next = activated ? "ACTIVE" : "INVITED";
  }

  await prisma.user.update({ where: { id: employee.userId }, data: { status: next } });
  if (next === "SUSPENDED" || next === "DISABLED") {
    await prisma.session.updateMany({
      where: { userId: employee.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: statusAudit(next),
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
  return { status: next };
}

export async function deleteEmployee(req: Request, employeeId: string) {
  await setEmployeeStatus(req, employeeId, "DISABLED");
}

export async function adminResetPassword(req: Request, employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!employee) throw errors.notFound("Employee not found");
  if (employee.user.status === "INVITED") {
    return resendInvitation(req, employeeId);
  }
  const result = await forgotPassword(employee.user.email, clientIp(req));
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ADMIN_PASSWORD_RESET",
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
  return { sent: true, resetUrl: result.resetUrl };
}

export async function updateOwnProfile(
  req: Request,
  data: z.infer<typeof profileSchema>,
  photo?: Express.Multer.File | null,
) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Only employees can update this profile");

  let photoFileId: string | undefined;
  if (photo) {
    const saved = await storeBuffer({
      buffer: photo.buffer,
      originalName: photo.originalname,
      mimeType: photo.mimetype,
      kind: "image",
      uploadedById: req.auth!.userId,
      ownerType: "PROFILE",
      employeeId,
      relatedId: employeeId,
    });
    photoFileId = saved.id;
  }

  const skills = data.skills
    ? JSON.stringify(data.skills.split(",").map((s) => s.trim()).filter(Boolean))
    : undefined;

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      fullName: data.fullName,
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00`) : null,
      address: data.address ?? null,
      emergencyName: data.emergencyName ?? null,
      emergencyPhone: data.emergencyPhone ?? null,
      ...(skills ? { skills } : {}),
      ...(photoFileId ? { photoFileId } : {}),
    },
  });

  await writeAudit({
    actorId: req.auth!.userId,
    action: "PROFILE_UPDATED",
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
}

export async function getOwnProfile(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { email: true, username: true, status: true } }, photo: true },
  });
  if (!employee) throw errors.notFound("Employee not found");
  const { panEnc: _pan, govIdNumberEnc: _gov, ...safe } = employee;
  return safe;
}
