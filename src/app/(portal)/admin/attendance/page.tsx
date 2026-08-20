import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { dateKeyInTz, monthKey, formatTime } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminUpsertAttendanceAction, reviewCorrectionAction } from "@/server/actions/attendance";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/pagination";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; month?: string; date?: string; range?: string; department?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month ?? monthKey();
  const date = sp.date ?? dateKeyInTz();
  const range = sp.range ?? "today";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    dateKey: string;
    from: string;
    to: string;
    employees: { id: string; fullName: string; employeeCode: string; department: string | null }[];
    rows: { id: string; dateKey: string; status: string; checkInAt: string | null; checkOutAt: string | null; employee: { fullName: string; employeeCode: string } }[];
    corrections: { id: string; reason: string; proposedStatus: string; employee: { fullName: string }; attendance: { dateKey: string } }[];
    total: number;
    limit: number;
    page: number;
  }>(`/api/admin/attendance?range=${encodeURIComponent(range)}&dateKey=${encodeURIComponent(date)}&from=${encodeURIComponent(sp.from ?? "")}&to=${encodeURIComponent(sp.to ?? "")}&employeeId=${encodeURIComponent(sp.employeeId ?? "")}&department=${encodeURIComponent(sp.department ?? "")}&page=${page}&limit=25`);
  const employees = data.employees;
  const rows = data.rows;
  const corrections = data.corrections;

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Filter, correct, and export attendance."
        actions={
          <a
            href={`/api/admin/attendance/export?range=${encodeURIComponent(range)}&dateKey=${encodeURIComponent(date)}&from=${encodeURIComponent(sp.from ?? "")}&to=${encodeURIComponent(sp.to ?? "")}&employeeId=${encodeURIComponent(sp.employeeId ?? "")}&department=${encodeURIComponent(sp.department ?? "")}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Export CSV
          </a>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <select name="range" defaultValue={range} className="h-8 rounded-lg border px-2 text-sm">
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
        <select name="employeeId" defaultValue={sp.employeeId ?? ""} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullName}
            </option>
          ))}
        </select>
        <Input name="department" placeholder="Department" defaultValue={sp.department ?? ""} />
        <Input type="month" name="month" defaultValue={month} />
        <Input type="date" name="date" defaultValue={date} />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {corrections.length ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Correction requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {corrections.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{c.employee.fullName} · {c.attendance.dateKey}</p>
                  <p className="text-muted-foreground">{c.reason} → {c.proposedStatus}</p>
                </div>
                <div className="flex gap-2">
                  <ConfirmButton label="Approve" title="Approve correction" description="Apply the proposed attendance." action={reviewCorrectionAction.bind(null, c.id, "APPROVED")} />
                  <ConfirmButton label="Reject" title="Reject correction" description="Keep the original record." variant="destructive" action={reviewCorrectionAction.bind(null, c.id, "REJECTED")} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card className="mb-6">
        <CardHeader><CardTitle>Manual correction</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={adminUpsertAttendanceAction} className="grid gap-3 sm:grid-cols-4">
            <Field label="Employee">
              <select name="employeeId" className="h-8 w-full rounded-lg border px-2 text-sm" required>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.fullName}</option>
                ))}
              </select>
            </Field>
            <Field label="Date"><Input type="date" name="dateKey" required defaultValue={date} /></Field>
            <Field label="Status">
              <select name="status" className="h-8 w-full rounded-lg border px-2 text-sm">
                <option>PRESENT</option><option>LATE</option><option>HALF_DAY</option><option>LEAVE</option><option>ABSENT</option>
              </select>
            </Field>
            <Field label="Notes"><Input name="notes" /></Field>
            <Button type="submit">Save</Button>
          </ActionForm>
        </CardContent>
      </Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Check-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.dateKey}</TableCell>
              <TableCell>{r.employee.fullName}</TableCell>
              <TableCell><StatusBadge value={r.status} /></TableCell>
              <TableCell>{formatTime(r.checkInAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / (data.limit || 25)))} total={data.total} extra={{ range, employeeId: sp.employeeId, department: sp.department, date, month }} />
    </div>
  );
}
