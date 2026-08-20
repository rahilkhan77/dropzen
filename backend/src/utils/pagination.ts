import type { Request } from "express";

export function parsePage(req: Request, defaultLimit = 25) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const raw = Number(req.query.limit ?? req.query.take ?? defaultLimit);
  const limit = Math.min(100, Math.max(1, Number.isFinite(raw) ? raw : defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, take: limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
