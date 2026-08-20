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

export function hmToMinutes(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
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

export function workingDayCount(year: number, month: number, workingDays: number[]) {
  const total = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= total; day++) {
    if (workingDays.includes(new Date(year, month - 1, day).getDay())) count += 1;
  }
  return count;
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isWorkingDay(dateKey: string, workingDays: number[]) {
  return workingDays.includes(new Date(`${dateKey}T12:00:00`).getDay());
}

export function monthKey(date = new Date(), timeZone = DEFAULT_TZ) {
  return dateKeyInTz(date, timeZone).slice(0, 7);
}

export function yearMonthParts(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return { year, month };
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
