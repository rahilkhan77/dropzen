import { format, parseISO } from "date-fns";

export const DEFAULT_TZ = "Asia/Kolkata";

export function dateKeyInTz(date = new Date(), timeZone = DEFAULT_TZ) {
  return date.toLocaleDateString("en-CA", { timeZone });
}

export function timeHmInTz(date = new Date(), timeZone = DEFAULT_TZ) {
  return date.toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatLongDate(dateKey: string) {
  return format(parseISO(`${dateKey}T00:00:00`), "EEEE, d MMMM yyyy");
}

export function formatShortDate(dateKey: string) {
  return format(parseISO(`${dateKey}T00:00:00`), "d MMM yyyy");
}

/** Normalize API date values (ISO strings or Date) for `<input type="date">`. */
export function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const raw = typeof value === "string" ? value : value.toISOString();
  return raw.slice(0, 10);
}

export function formatDateTime(value: Date | string, timeZone = DEFAULT_TZ) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatTime(value: Date | string | null | undefined, timeZone = DEFAULT_TZ) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    timeStyle: "short",
  }).format(date);
}

export function monthKey(date = new Date(), timeZone = DEFAULT_TZ) {
  const key = dateKeyInTz(date, timeZone);
  return key.slice(0, 7);
}

export function yearMonthParts(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function addDaysKey(dateKey: string, days: number) {
  const d = parseISO(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

export function eachDateKey(start: string, end: string) {
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return keys;
}

export function weekdayMon0(dateKey: string) {
  return parseISO(`${dateKey}T12:00:00`).getDay();
}

export function hmToMinutes(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function workingDayCount(year: number, month: number, workingDays: number[]) {
  const total = daysInMonth(year, month);
  let count = 0;
  for (let day = 1; day <= total; day++) {
    const d = new Date(year, month - 1, day);
    if (workingDays.includes(d.getDay())) count += 1;
  }
  return count;
}

export function monthName(month: number) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1];
}
