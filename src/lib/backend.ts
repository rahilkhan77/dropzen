import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { fail, ok, type ActionResult } from "@/lib/action";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";

function parseSetCookie(setCookie: string) {
  const parts = setCookie.split(";");
  const [pair] = parts;
  const eq = pair.indexOf("=");
  const name = pair.slice(0, eq).trim();
  const value = decodeURIComponent(pair.slice(eq + 1).trim());
  const options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
  } = { path: "/" };
  for (const attr of parts.slice(1)) {
    const [rawK, rawV] = attr.trim().split("=");
    const key = rawK.toLowerCase();
    if (key === "httponly") options.httpOnly = true;
    else if (key === "secure") options.secure = true;
    else if (key === "samesite") options.sameSite = (rawV || "lax").toLowerCase() as "lax" | "strict" | "none";
    else if (key === "path") options.path = rawV;
    else if (key === "max-age") options.maxAge = Number(rawV);
  }
  return { name, value, options };
}

async function applySetCookies(res: Response) {
  const store = await cookies();
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    const parsed = parseSetCookie(raw);
    if (!parsed.value) store.delete(parsed.name);
    else store.set(parsed.name, parsed.value, parsed.options);
  }
}

async function cookieHeader() {
  const jar = await cookies();
  return jar.toString();
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { cookie: await cookieHeader() },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ success: false, message: "Request failed" }));
  if (res.status === 401) redirect("/login");
  if (res.status === 403 && json.code === "KYC_REQUIRED") redirect("/employee/kyc");
  if (res.status === 403) redirect("/dashboard");
  if (res.status === 404) notFound();
  if (!json.success) throw new Error(json.message || "Request failed");
  return json.data as T;
}

export async function apiGetOptional<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { cookie: await cookieHeader() },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({ success: false }));
  if (res.status === 401) redirect("/login");
  if (res.status === 403 && json.code === "KYC_REQUIRED") redirect("/employee/kyc");
  if (res.status === 404) return null;
  if (res.status === 403) return null;
  if (!json.success) return null;
  return json.data as T;
}

export async function mutate(
  path: string,
  formData?: FormData,
  method: string = "POST",
): Promise<ActionResult<unknown>> {
  let body: BodyInit | undefined;
  const headers: Record<string, string> = { cookie: await cookieHeader() };
  if (formData) {
    const hasFile = [...formData.values()].some((v) => typeof File !== "undefined" && v instanceof File);
    if (hasFile) {
      body = formData;
    } else {
      const params = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") params.append(key, value);
      }
      body = params;
    }
  }
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers,
    body,
    cache: "no-store",
  });
  await applySetCookies(res);
  const json = await res.json().catch(() => ({
    success: false,
    message: "Unexpected server error",
  }));
  if (res.status === 403 && json.code === "KYC_REQUIRED") redirect("/employee/kyc");
  if (!json.success) return fail(json.message || "Request failed");
  if (json.data?.redirectTo) redirect(json.data.redirectTo as string);
  return ok(json.data, json.message);
}

export async function getSessionUser() {
  const res = await fetch(`${BACKEND}/api/auth/me`, {
    headers: { cookie: await cookieHeader() },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) return null;
  const json = await res.json();
  if (!json.success) return null;
  return json.data as SessionUser;
}

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  employeeId: string | null;
  employeeCode: string | null;
  mustChangePassword: boolean;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  photoFileId: string | null;
  unread: number;
  kycStatus: "NOT_STARTED" | "INCOMPLETE" | "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | null;
};
