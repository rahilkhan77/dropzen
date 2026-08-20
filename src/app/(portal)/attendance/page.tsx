import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { getSettings } from "@/lib/settings";
import { dateKeyInTz, daysInMonth, monthKey, yearMonthParts, weekdayMon0 } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  checkoutAttendanceAction,
  markAttendanceAction,
  requestAttendanceCorrectionAction,
} from "@/server/actions/attendance";
import { cn } from "@/lib/utils";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireApprovedEmployee();
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  const sp = await searchParams;
  const ym = sp.month ?? monthKey(new Date(), settings.timezone);
  const { year, month } = yearMonthParts(ym);
  const start = `${ym}-01`;
  const end = `${ym}-${String(daysInMonth(year, month)).padStart(2, "0")}`;

  const [history, todayRow] = await Promise.all([
    apiGet<{ dateKey: string; status: string; checkInAt: string | null; checkOutAt: string | null }[]>("/api/attendance/history"),
    apiGet<{ status: string; checkInAt: string | null; checkOutAt: string | null } | null>("/api/attendance/today"),
  ]);
  const rows = history.filter((r) => r.dateKey >= start && r.dateKey <= end);
  const byDate = Object.fromEntries(rows.map((r) => [r.dateKey, r]));
  const present = rows.filter((r) => ["PRESENT", "LATE", "HALF_DAY"].includes(r.status)).length;
  const absent = rows.filter((r) => r.status === "ABSENT").length;
  const leave = rows.filter((r) => r.status === "LEAVE").length;
  const late = rows.filter((r) => r.status === "LATE").length;
  const totalDays = daysInMonth(year, month);
  const firstWeekday = weekdayMon0(`${ym}-01`);
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null)];
  for (let d = 1; d <= totalDays; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Mark today, review the month, and request corrections."
        actions={
          <div className="flex gap-2">
            {!todayRow?.checkInAt ? (
              <ActionForm action={markAttendanceAction}>
                <Button type="submit">Check in</Button>
              </ActionForm>
            ) : !todayRow.checkOutAt ? (
              <ActionForm action={checkoutAttendanceAction}>
                <Button type="submit">Check out</Button>
              </ActionForm>
            ) : (
              <StatusBadge value={todayRow.status} />
            )}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Working / present" value={present} />
        <StatCard label="Absent" value={absent} />
        <StatCard label="Leave" value={leave} />
        <StatCard label="Late" value={late} />
        <StatCard label="Today" value={todayRow?.status.replaceAll("_", " ") ?? "Not marked"} hint={todayRow ? undefined : "Attendance has not been marked today."} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No attendance records found." description="Check in to create today's record. History only appears after actual check-ins." />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Monthly calendar</CardTitle>
          <form method="get" className="flex items-center gap-2">
            <Input type="month" name="month" defaultValue={ym} />
            <Button type="submit" variant="outline" size="sm">Go</Button>
          </form>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((key, i) => {
              if (!key) return <div key={`e-${i}`} />;
              const row = byDate[key];
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-16 rounded-lg border p-1 text-left text-xs",
                    key === today && "ring-2 ring-primary",
                  )}
                >
                  <p className="font-medium">{Number(key.slice(-2))}</p>
                  {row ? <StatusBadge value={row.status} className="mt-1" /> : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Request a correction</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={requestAttendanceCorrectionAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" name="dateKey" required defaultValue={today} />
            </Field>
            <Field label="Proposed status">
              <select name="proposedStatus" className="h-8 w-full rounded-lg border px-2 text-sm">
                <option>PRESENT</option>
                <option>LATE</option>
                <option>HALF_DAY</option>
                <option>LEAVE</option>
                <option>ABSENT</option>
              </select>
            </Field>
            <Field label="Proposed check-in">
              <Input type="datetime-local" name="proposedCheckIn" />
            </Field>
            <Field label="Proposed check-out">
              <Input type="datetime-local" name="proposedCheckOut" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Reason">
                <Textarea name="reason" required />
              </Field>
            </div>
            <Button type="submit">Submit request</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
