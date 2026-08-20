import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors.js";
import { isProd } from "../config/env.js";
import { log } from "../utils/log.js";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId;
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: err.code === "LIMIT_FILE_SIZE" ? "File is too large" : "Upload failed",
      code: "UPLOAD_ERROR",
      requestId,
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: err.issues[0]?.message ?? "Invalid input",
      code: "VALIDATION_ERROR",
      requestId,
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      requestId,
    });
  }
  log("error", "unhandled error", {
    requestId,
    err: isProd ? (err instanceof Error ? err.message : "error") : err,
  });
  return res.status(500).json({
    success: false,
    message: "Unexpected server error",
    code: "INTERNAL_ERROR",
    requestId,
  });
}
