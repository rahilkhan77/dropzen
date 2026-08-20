import { prisma } from "../config/db.js";
import { DEFAULT_TZ, parseJson } from "../utils/dates.js";

export type AppSettings = {
  companyName: string;
  legalName: string;
  timezone: string;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  lateAfter: string;
  halfDayAfter: string;
  nextEmployeeSeq: number;
  defaultTaskHours: number;
  notifyDeadlineHours: number;
  payCycleDay: number;
  currency: string;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  website: string | null;
  logoFileId: string | null;
  sessionTtlHours: number;
  passwordMinLength: number;
  loginRateLimit: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
};

const fallback: AppSettings = {
  companyName: "DropZen",
  legalName: "DropZen Technologies",
  timezone: DEFAULT_TZ,
  workingDays: [1, 2, 3, 4, 5],
  workStart: "09:30",
  workEnd: "18:30",
  lateAfter: "10:00",
  halfDayAfter: "13:30",
  nextEmployeeSeq: 1001,
  defaultTaskHours: 4,
  notifyDeadlineHours: 24,
  payCycleDay: 1,
  currency: "INR",
  companyEmail: null,
  companyPhone: null,
  companyAddress: null,
  website: null,
  logoFileId: null,
  sessionTtlHours: 24,
  passwordMinLength: 8,
  loginRateLimit: 10,
  emailNotifications: true,
  inAppNotifications: true,
};

function fromRow(row: {
  companyName: string;
  legalName: string;
  timezone: string;
  workingDays: string;
  workStart: string;
  workEnd: string;
  lateAfter: string;
  halfDayAfter: string;
  nextEmployeeSeq: number;
  defaultTaskHours: number;
  notifyDeadlineHours: number;
  payCycleDay: number;
  currency: string;
  companyEmail: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  website: string | null;
  logoFileId: string | null;
  sessionTtlHours: number;
  passwordMinLength: number;
  loginRateLimit: number;
  emailNotifications: boolean;
  inAppNotifications: boolean;
}): AppSettings {
  return {
    companyName: row.companyName,
    legalName: row.legalName,
    timezone: row.timezone || DEFAULT_TZ,
    workingDays: parseJson<number[]>(row.workingDays, fallback.workingDays),
    workStart: row.workStart,
    workEnd: row.workEnd,
    lateAfter: row.lateAfter,
    halfDayAfter: row.halfDayAfter,
    nextEmployeeSeq: row.nextEmployeeSeq,
    defaultTaskHours: row.defaultTaskHours,
    notifyDeadlineHours: row.notifyDeadlineHours,
    payCycleDay: row.payCycleDay,
    currency: row.currency,
    companyEmail: row.companyEmail,
    companyPhone: row.companyPhone,
    companyAddress: row.companyAddress,
    website: row.website,
    logoFileId: row.logoFileId,
    sessionTtlHours: row.sessionTtlHours,
    passwordMinLength: row.passwordMinLength,
    loginRateLimit: row.loginRateLimit,
    emailNotifications: row.emailNotifications,
    inAppNotifications: row.inAppNotifications,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.companySettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  return fromRow(row);
}

export async function publicBranding() {
  const settings = await getSettings();
  return {
    companyName: settings.companyName,
    legalName: settings.legalName,
    timezone: settings.timezone,
    hasLogo: Boolean(settings.logoFileId),
  };
}

export type SettingsPatch = Partial<Omit<AppSettings, "nextEmployeeSeq" | "workingDays">> & {
  workingDays?: number[];
};

export async function saveSettings(partial: SettingsPatch) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await prisma.companySettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...next, workingDays: JSON.stringify(next.workingDays) },
    update: { ...next, workingDays: JSON.stringify(next.workingDays) },
  });
  return next;
}

export async function nextEmployeeCode() {
  const settings = await prisma.companySettings.upsert({
    where: { id: "default" },
    update: { nextEmployeeSeq: { increment: 1 } },
    create: { id: "default", nextEmployeeSeq: 1002 },
  });
  const seq = settings.nextEmployeeSeq - 1;
  return `DZ-${seq}`;
}
