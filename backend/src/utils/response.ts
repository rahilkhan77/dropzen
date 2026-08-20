import type { Response } from "express";

export function ok(res: Response, data?: unknown, message?: string, status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function created(res: Response, data?: unknown, message?: string) {
  return ok(res, data, message, 201);
}
