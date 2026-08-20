import type { Request } from "express";
import { env, isProd } from "../config/env.js";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "../utils/crypto.js";
import { writeAudit } from "./audit.js";
import { clientIp } from "../middleware/auth.js";
import { EmailService } from "./email.js";
import { getSettings } from "./settings.js";
import { passwordSchema } from "../validators/index.js";

const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
    maxAge: env.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000,
  };
}

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  employeeId: string | null;
  employeeCode: string | null;
  mustChangePassword: boolean;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  photoFileId: string | null;
  unread: number;
  kycStatus: "NOT_STARTED" | "INCOMPLETE" | "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | null;
};

function toSession(user: {
  id: string;
  email: string;
  username: string;
  role: "ADMIN" | "EMPLOYEE";
  mustChangePassword: boolean;
  status: SessionUser["status"];
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    photoFileId: string | null;
    kycStatus: SessionUser["kycStatus"];
  } | null;
  unread?: number;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    name: user.employee?.fullName ?? user.username,
    employeeId: user.employee?.id ?? null,
    employeeCode: user.employee?.employeeCode ?? null,
    mustChangePassword: user.mustChangePassword,
    status: user.status,
    photoFileId: user.employee?.photoFileId ?? null,
    unread: user.unread ?? 0,
    kycStatus: user.employee?.kycStatus ?? null,
  };
}

export async function assertPasswordPolicy(password: string) {
  const settings = await getSettings();
  const min = Math.max(8, settings.passwordMinLength);
  if (password.length < min) {
    throw errors.validation(`Password must be at least ${min} characters`);
  }
  passwordSchema.parse(password);
}

export async function login(req: Request, identifier: string, password: string) {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { username: id }] },
    include: { employee: true },
  });
  if (!user) {
    await writeAudit({ action: "LOGIN_FAILED", entityType: "User", metadata: { identifier: id }, ip: clientIp(req) });
    throw errors.unauthorized("Invalid email/username or password");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw errors.locked("Account temporarily locked after too many failed attempts. Try again later.");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      ip: clientIp(req),
    });
    throw errors.unauthorized("Invalid email/username or password");
  }

  if (user.status === "INVITED") {
    throw errors.forbidden("This account has not been activated. Use the invitation sent to your email.");
  }
  if (user.status === "SUSPENDED") {
    throw errors.forbidden("This account is suspended. Contact your administrator.");
  }
  if (user.status !== "ACTIVE") {
    throw errors.forbidden("This account is disabled. Contact your administrator.");
  }

  const settings = await getSettings();
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const token = randomToken(32);
  const now = new Date();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + settings.sessionTtlHours * 60 * 60 * 1000),
      absoluteExpiresAt: new Date(now.getTime() + env.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000),
      ip: clientIp(req) ?? null,
      userAgent: req.get("user-agent") ?? null,
    },
  });
  await writeAudit({
    actorId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ip: clientIp(req),
  });
  return { token, user: toSession(user) };
}

export async function logout(req: Request) {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (req.auth) {
    await writeAudit({
      actorId: req.auth.userId,
      action: "LOGOUT",
      entityType: "User",
      entityId: req.auth.userId,
      ip: clientIp(req),
    });
  }
}

export async function changePassword(userId: string, current: string, next: string, ip?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw errors.notFound("User not found");
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw errors.validation("Current password is incorrect");
  }
  await assertPasswordPolicy(next);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAudit({ actorId: userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: userId, ip });
}

export async function forgotPassword(identifier: string, ip?: string | null) {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { username: id }] },
    include: { employee: true },
  });
  const generic = { sent: true as const, resetUrl: undefined as string | undefined };
  if (!user || user.status !== "ACTIVE") return generic;
  await prisma.passwordReset.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomToken(24);
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await EmailService.sendPasswordReset({
    to: user.email,
    name: user.employee?.fullName ?? user.username,
    resetUrl,
  });
  await writeAudit({
    actorId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    entityType: "User",
    entityId: user.id,
    ip,
  });
  return {
    sent: true as const,
    resetUrl: !isProd || env.DEMO_SHOW_RESET_LINK === "true" ? resetUrl : undefined,
  };
}

export async function resetPassword(token: string, password: string) {
  await assertPasswordPolicy(password);
  const row = await prisma.passwordReset.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw errors.validation("This reset link is invalid or has expired.");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(password), mustChangePassword: false },
    }),
    prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await writeAudit({
    actorId: row.userId,
    action: "PASSWORD_RESET",
    entityType: "User",
    entityId: row.userId,
  });
}

export async function me(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { employee: true },
  });
  if (!user) throw errors.unauthorized();
  const unread = await prisma.notification.count({ where: { userId, readAt: null } });
  return toSession({ ...user, unread });
}
