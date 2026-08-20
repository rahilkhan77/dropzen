import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { sha256 } from "../utils/crypto.js";
import { errors } from "../utils/errors.js";
import { asyncHandler } from "./error.js";

export function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  return req.ip;
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
  if (!token) throw errors.unauthorized();

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { employee: true } } },
  });
  if (!session || session.revokedAt) throw errors.unauthorized("Session expired. Please sign in again.");
  if (session.expiresAt < new Date() || session.absoluteExpiresAt < new Date()) {
    throw errors.unauthorized("Session expired. Please sign in again.");
  }
  if (session.user.status !== "ACTIVE") {
    throw errors.forbidden("This account is not allowed to access the application.");
  }

  const sliding = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  if (sliding < session.absoluteExpiresAt && sliding > session.expiresAt) {
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: sliding } });
  }

  req.auth = {
    sessionId: session.id,
    userId: session.user.id,
    role: session.user.role,
    email: session.user.email,
    employeeId: session.user.employee?.id ?? null,
    employeeCode: session.user.employee?.employeeCode ?? null,
    name: session.user.employee?.fullName ?? session.user.username,
    kycStatus: session.user.employee?.kycStatus ?? null,
  };
  next();
});

export function requireRole(...roles: Array<"ADMIN" | "EMPLOYEE">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(errors.unauthorized());
    if (!roles.includes(req.auth.role)) return next(errors.forbidden());
    next();
  };
}

export async function assertApprovedEmployee(req: Request) {
  if (!req.auth) throw errors.unauthorized();
  if (req.auth.role !== "EMPLOYEE") throw errors.forbidden();
  if (!req.auth.employeeId) throw errors.forbidden("Employee profile required");
  const emp = await prisma.employee.findUnique({
    where: { id: req.auth.employeeId },
    select: { kycStatus: true, user: { select: { status: true } } },
  });
  if (!emp || emp.user.status !== "ACTIVE") {
    throw errors.forbidden("This account is not allowed to access the application.");
  }
  if (emp.kycStatus !== "APPROVED") throw errors.kycRequired();
}

export const requireAdmin = [requireAuth, requireRole("ADMIN")];
export const requireEmployee = [requireAuth, requireRole("EMPLOYEE")];
export const requireApprovedEmployee = [
  ...requireEmployee,
  asyncHandler(async (req, _res, next) => {
    await assertApprovedEmployee(req);
    next();
  }),
];
export const requireAny = [requireAuth];
