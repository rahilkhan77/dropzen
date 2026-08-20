import type { Request } from "express";
import { env, isProd } from "../config/env.js";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { hashPassword, randomToken, sha256 } from "../utils/crypto.js";
import { writeAudit } from "./audit.js";
import { EmailService } from "./email.js";
import { getSettings } from "./settings.js";
import { clientIp } from "../middleware/auth.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteUrl(token: string) {
  return `${env.FRONTEND_URL}/invite/${token}`;
}

export function publicInviteUrl(token: string | undefined) {
  if (!token) return undefined;
  if (isProd && env.DEMO_SHOW_RESET_LINK !== "true") return undefined;
  return inviteUrl(token);
}

export async function issueInvitation(opts: {
  req: Request;
  userId: string;
  employeeId: string;
  email: string;
  name: string;
  action: "INVITATION_SENT" | "INVITATION_RESENT";
}) {
  await prisma.invitation.updateMany({
    where: { userId: opts.userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = randomToken(32);
  await prisma.invitation.create({
    data: {
      userId: opts.userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  await EmailService.sendEmployeeInvitation({
    to: opts.email,
    name: opts.name,
    inviteUrl: inviteUrl(token),
  });
  await writeAudit({
    actorId: opts.req.auth?.userId,
    action: opts.action,
    entityType: "Employee",
    entityId: opts.employeeId,
    metadata: { email: opts.email },
    ip: clientIp(opts.req),
  });
  return { token, inviteUrl: publicInviteUrl(token) };
}

export async function peekInvitation(token: string) {
  const row = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { employee: true } } },
  });
  const settings = await getSettings();
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.employee) {
    return { valid: false, companyName: settings.companyName };
  }
  if (row.user.status === "DISABLED" || row.user.status === "SUSPENDED") {
    return { valid: false, companyName: settings.companyName };
  }
  return {
    valid: true,
    companyName: settings.companyName,
    fullName: row.user.employee.fullName,
    email: row.user.email,
  };
}

export async function activateInvitation(
  req: Request,
  token: string,
  password: string,
): Promise<{ sessionToken: string; redirectTo: string }> {
  const row = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { employee: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.employee) {
    throw errors.validation("This invitation is invalid or has expired.");
  }
  if (row.user.status === "DISABLED" || row.user.status === "SUSPENDED") {
    throw errors.forbidden("This account cannot be activated. Contact your administrator.");
  }

  const settings = await getSettings();
  const now = new Date();
  const sessionToken = randomToken(32);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
      },
    }),
    prisma.invitation.update({ where: { id: row.id }, data: { usedAt: now } }),
    prisma.invitation.updateMany({
      where: { userId: row.userId, usedAt: null, NOT: { id: row.id } },
      data: { usedAt: now },
    }),
    prisma.session.create({
      data: {
        userId: row.userId,
        tokenHash: sha256(sessionToken),
        expiresAt: new Date(now.getTime() + settings.sessionTtlHours * 60 * 60 * 1000),
        absoluteExpiresAt: new Date(now.getTime() + env.SESSION_ABSOLUTE_DAYS * 24 * 60 * 60 * 1000),
        ip: clientIp(req) ?? null,
        userAgent: req.get("user-agent") ?? null,
      },
    }),
  ]);
  await writeAudit({
    actorId: row.userId,
    action: "INVITATION_ACCEPTED",
    entityType: "Employee",
    entityId: row.user.employee.id,
    ip: clientIp(req),
  });
  return { sessionToken, redirectTo: "/employee/kyc" };
}
