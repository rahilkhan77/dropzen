export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formFile(form: FormData, key: string) {
  const value = form.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export function formList(form: FormData, key: string) {
  return form
    .getAll(key)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}
