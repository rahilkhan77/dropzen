import type { Request } from "express";
import multer from "multer";
import { errors } from "../utils/errors.js";

const ALLOWED = new Set([".xlsx", ".xls", ".csv", ".pdf", ".jpg", ".jpeg", ".png"]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (!ALLOWED.has(ext)) {
      cb(errors.validation("This file type is not allowed"));
      return;
    }
    if (file.originalname.includes("..") || file.originalname.includes("/") || file.originalname.includes("\\")) {
      cb(errors.validation("Invalid filename"));
      return;
    }
    cb(null, true);
  },
});

export function reqFile(req: Request, field = "file") {
  const file = req.file ?? (req.files as Express.Multer.File[] | undefined)?.[0];
  return file ?? null;
}
