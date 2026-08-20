import "server-only";

import { apiGet } from "@/lib/backend";

export type AppSettings = {
  companyName: string;
  timezone: string;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  lateAfter: string;
  halfDayAfter: string;
  currency?: string;
  legalName?: string;
  defaultTaskHours?: number;
};

export async function getSettings(): Promise<AppSettings> {
  return apiGet<AppSettings>("/api/settings");
}
