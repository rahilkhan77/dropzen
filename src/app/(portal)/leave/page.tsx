import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyLeaveAction } from "@/server/actions/leave";

export default async function LeavePage() {
  const user = await requireApprovedEmployee();
  const data = await apiGet<{
    types: { id: string; name: string }[];
    balances: { id: string; allocated: number; used: number; pending: number; leaveType: { name: string } }[];
    requests: { id: string; startDate: string; endDate: string; days: number; reason: string; status: string; adminNote: string | null; leaveType: { name: string } }[];
  }>("/api/leave");
  const { types, balances, requests } = data;

  return (
    <div>
      <PageHeader title="Leave" description="Apply for leave and track your balance." />
      <div className="grid gap-4 sm:grid-cols-3">
        {balances.length === 0 ? (
          <div className="sm:col-span-3">
            <EmptyState title="No leave balance yet." description="Balances are created when your account is set up. None have been recorded for this year." />
          </div>
        ) : (
          balances.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-base">{b.leaveType.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{b.allocated - b.used}</p>
                <p className="text-xs text-muted-foreground">
                  remaining of {b.allocated} ({b.used} used)
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Apply</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={applyLeaveAction} className="space-y-3">
              <Field label="Type">
                <select name="leaveTypeId" className="h-8 w-full rounded-lg border px-2 text-sm" required>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start">
                <Input type="date" name="startDate" required />
              </Field>
              <Field label="End">
                <Input type="date" name="endDate" required />
              </Field>
              <Field label="Reason">
                <Textarea name="reason" required />
              </Field>
              <Button type="submit">Submit request</Button>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Previous requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.length === 0 ? (
              <EmptyState title="No leave requests yet." description="Submit a request and it will be stored for an administrator to review." />
            ) : (
              requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{r.leaveType.name}</p>
                    <p className="text-muted-foreground">
                      {r.startDate} → {r.endDate} · {r.days} day(s)
                    </p>
                  </div>
                  <StatusBadge value={r.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
