import { isProd } from "../config/env.js";

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /password|token|secret|authorization|cookie|pan|accountnumber|govid/i;

function scrub(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? "[redacted]" : scrub(nested);
    }
    return out;
  }
  return value;
}

export function log(level: Level, message: string, extra: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
    ...((isProd ? scrub(extra) : extra) as Record<string, unknown>),
  };
  if (isProd && extra.err instanceof Error) {
    payload.err = extra.err.message;
  }
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
