import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { FileOwnerType } from "@prisma/client";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { errors } from "../utils/errors.js";

export type UploadKind = "excel" | "image" | "document";

const EXCEL_EXT = new Set([".xlsx", ".xls", ".csv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);
const DOC_EXT = new Set([".xlsx", ".xls", ".csv", ".pdf", ".jpg", ".jpeg", ".png"]);

const MIME: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const MAX: Record<UploadKind, number> = {
  excel: 12 * 1024 * 1024,
  image: 5 * 1024 * 1024,
  document: 15 * 1024 * 1024,
};

function extOf(name: string) {
  return path.extname(name).toLowerCase();
}

function allowed(kind: UploadKind) {
  if (kind === "excel") return EXCEL_EXT;
  if (kind === "image") return IMAGE_EXT;
  return DOC_EXT;
}

export function uploadRoot() {
  return path.resolve(env.UPLOAD_DIR);
}

/** Local disk storage. Swap this module later for S3 without changing callers. */
export async function storeBuffer(opts: {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  kind: UploadKind;
  uploadedById: string;
  ownerType: FileOwnerType;
  relatedId?: string | null;
  employeeId?: string | null;
}) {
  const ext = extOf(opts.originalName);
  if (!allowed(opts.kind).has(ext)) {
    throw errors.validation(`File type ${ext || "(none)"} is not allowed`);
  }
  if (opts.buffer.length > MAX[opts.kind]) {
    throw errors.validation(`File is too large (max ${Math.round(MAX[opts.kind] / 1024 / 1024)}MB)`);
  }
  if (opts.originalName.includes("..") || /[/\\]/.test(opts.originalName)) {
    throw errors.validation("Invalid filename");
  }

  const id = randomUUID();
  const storedName = `${id}${ext}`;
  const relDir = id;
  const absDir = path.join(uploadRoot(), relDir);
  await mkdir(absDir, { recursive: true });
  await writeFile(path.join(absDir, storedName), opts.buffer);
  const storageKey = path.posix.join(relDir, storedName);

  return prisma.fileAsset.create({
    data: {
      originalName: path.basename(opts.originalName).slice(0, 180),
      storedName,
      mimeType: opts.mimeType || MIME[ext] || "application/octet-stream",
      sizeBytes: opts.buffer.length,
      storageKey,
      ownerType: opts.ownerType,
      relatedId: opts.relatedId ?? null,
      uploadedById: opts.uploadedById,
      employeeId: opts.employeeId ?? null,
    },
  });
}

export async function readStoredFile(storageKey: string) {
  const root = uploadRoot();
  const abs = path.resolve(root, storageKey);
  if (!abs.startsWith(root)) throw errors.forbidden("Invalid file path");
  return readFile(abs);
}

export async function deleteStoredFile(storageKey: string) {
  const root = uploadRoot();
  const abs = path.resolve(root, storageKey);
  if (!abs.startsWith(root)) return;
  await unlink(abs).catch(() => undefined);
}
