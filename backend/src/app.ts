import { randomUUID } from "crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env, isProd } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { errorHandler } from "./middleware/error.js";

const SECRET_JSON_KEYS = new Set([
  "storageKey",
  "storedName",
  "panEnc",
  "govIdNumberEnc",
  "accountNumberEnc",
  "passwordHash",
  "tokenHash",
]);

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.set("json replacer", (key: string, value: unknown) => (SECRET_JSON_KEYS.has(key) ? undefined : value));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use((req, res, next) => {
    const header = req.headers["x-request-id"];
    const id = typeof header === "string" && header.trim() ? header.trim() : randomUUID();
    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: isProd ? 120 : 400,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, message: "Too many requests", code: "RATE_LIMITED" },
    }),
  );

  app.use("/api/auth", authRouter);
  app.use("/api", apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Not found", code: "NOT_FOUND" });
  });
  app.use(errorHandler);
  return app;
}
