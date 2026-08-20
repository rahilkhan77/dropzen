import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminAddLeaveAction, reviewLeaveAction } from "@/server/actions/leave";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; employeeId?: string; leaveTypeId?: string; from?: string; to?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    all: { id: string; startDate: string; endDate: string; days: number; reason: string; status: string; employee: { fullName: string }; leaveType: { name: string } }[];
    employees: { id: string; fullName: string }[];
    types: { id: string; name: string }[];
    total: number;
    limit: number;
    page: number;
  }>(`/api/admin/leave?status=${encodeURIComponent(status === "ALL" ? "" : status)}&q=${encodeURIComponent(sp.q ?? "")}&employeeId=${encodeURIComponent(sp.employeeId ?? "")}&leaveTypeId=${encodeURIComponent(sp.leaveTypeId ?? "")}&from=${encodeURIComponent(sp.from ?? "")}&to=${encodeURIComponent(sp.to ?? "")}&page=${page}&limit=25`);
  const requests = data.all;
  const employees = data.employees;
  const types = data.types;

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Approve requests and view team leave."
        actions={<a href="/api/export/leave" className={cn(buttonVariants({ variant: "outline" }))}>Export</a>}
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" placeholder="Employee" defaultValue={sp.q ?? ""} />
        <select name="status" defaultValue={status} className="h-8 rounded-lg border px-2 text-sm">
          <option value="PENDING">Pending</option>
          <option value="ALL">All</option>
          <option>APPROVED</option>
          <option>REJECTED</option>
        </select>
        <select name="employeeId" defaultValue={sp.employeeId ?? ""} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
        <select name="leaveTypeId" defaultValue={sp.leaveTypeId ?? ""} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">All types</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Input type="date" name="from" defaultValue={sp.from ?? ""} />
        <Input type="date" name="to" defaultValue={sp.to ?? ""} />
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leave requests match these filters.</p>
            ) : (
              requests.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.employee.fullName} · {r.leaveType.name}</p>
                  <StatusBadge value={r.status} />
                </div>
                <p className="text-muted-foreground">{r.startDate} → {r.endDate} ({r.days}d) · {r.reason}</p>
                {r.status === "PENDING" ? (
                  <div className="mt-2 flex gap-2">
                    <ConfirmButton label="Approve" title="Approve leave" description="Balance and attendance will be updated." action={reviewLeaveAction.bind(null, r.id, "APPROVED")} />
                    <ConfirmButton label="Reject" title="Reject leave" description="The employee will be notified." variant="destructive" action={reviewLeaveAction.bind(null, r.id, "REJECTED")} />
                  </div>
                ) : null}
              </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Add leave</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={adminAddLeaveAction} className="space-y-3">
              <Field label="Employee">
                <select name="employeeId" className="h-8 w-full rounded-lg border px-2 text-sm">
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select name="leaveTypeId" className="h-8 w-full rounded-lg border px-2 text-sm">
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Start"><Input type="date" name="startDate" required /></Field>
              <Field label="End"><Input type="date" name="endDate" required /></Field>
              <Field label="Reason"><Textarea name="reason" /></Field>
              <Button type="submit">Add approved leave</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / (data.limit || 25)))} total={data.total} extra={{ status, q: sp.q, employeeId: sp.employeeId, leaveTypeId: sp.leaveTypeId, from: sp.from, to: sp.to }} />
    </div>
  );
}
