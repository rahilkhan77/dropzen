import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  APP_URL: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  DEMO_SHOW_RESET_LINK: z.string().optional(),
  COOKIE_NAME: z.string().default("dropzen_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().default(7),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  ...parsed.data,
  SMTP_SECURE: ["true", "1", "yes"].includes((parsed.data.SMTP_SECURE ?? "").toLowerCase()),
};
export const isProd = env.NODE_ENV === "production";

export function assertProductionEnv() {
  if (!isProd) return;
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!env.FRONTEND_URL) missing.push("FRONTEND_URL");
  if (!env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!env.SMTP_FROM) missing.push("SMTP_FROM");
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}
