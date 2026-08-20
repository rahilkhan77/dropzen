import { prisma } from "../config/db.js";

export async function listAudit(page = 1, take = 50, q?: string) {
  const limit = Math.min(100, Math.max(1, take));
  const where = q
    ? {
        OR: [
          { action: { contains: q, mode: "insensitive" as const } },
          { entityType: { contains: q, mode: "insensitive" as const } },
          { actor: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { email: true, username: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, take: limit, limit };
}

export async function upsertLeaveType(data: {
  id?: string;
  name: string;
  daysPerYear: number;
  paid?: boolean;
  active?: boolean;
  carryForward?: boolean;
}) {
  if (data.id) {
    return prisma.leaveType.update({
      where: { id: data.id },
      data: {
        name: data.name,
        daysPerYear: data.daysPerYear,
        paid: data.paid ?? true,
        active: data.active ?? true,
        carryForward: data.carryForward ?? false,
      },
    });
  }
  return prisma.leaveType.create({
    data: {
      name: data.name,
      daysPerYear: data.daysPerYear,
      paid: data.paid ?? true,
      carryForward: data.carryForward ?? false,
    },
  });
}
