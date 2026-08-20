import type { Request } from "express";

export function param(req: Request, key: string) {
  const v = req.params[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  return typeof v === "string" ? v : "";
}

export function field(req: Request, key: string) {
  const v = req.body?.[key];
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

export function list(req: Request, key: string) {
  const v = req.body?.[key];
  if (Array.isArray(v)) return v.map(String).filter((s) => s.length > 0);
  if (typeof v === "string" && v.length) return [v];
  return [];
}

export function bool(req: Request, key: string) {
  const v = field(req, key);
  return v === "true" || v === "on" || v === "1";
}
