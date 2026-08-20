import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatInr, cn } from "@/lib/utils";
import { monthName } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { upsertSalaryAction, verifyBankDetailsAction } from "@/server/actions/payroll";
import { Pagination } from "@/components/pagination";

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; month?: string; year?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const [data, options] = await Promise.all([
    apiGet<{
      items: {
        id: string;
        fullName: string;
        employeeCode: string;
        bankDetails: { status: string; bankName: string; ifsc: string; accountNumberMasked: string; panMasked: string } | null;
        salaryRecords: { id: string; month: number; year: number; amount: number; status: string; payslipFileId: string | null }[];
      }[];
      total: number;
      limit: number;
    }>(`/api/admin/payroll?q=${encodeURIComponent(q)}&month=${encodeURIComponent(sp.month ?? "")}&year=${encodeURIComponent(sp.year ?? "")}&page=${page}&limit=25`),
    apiGet<{ items: { id: string; fullName: string; employeeCode: string }[] }>("/api/admin/employees/options"),
  ]);
  const employees = data.items;

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Verify bank details, record salary, and attach payslips."
        actions={
          <div className="flex gap-2">
            <a href="/api/export/payroll" className={cn(buttonVariants({ variant: "outline" }))}>Export payroll</a>
            <a href="/api/export/payroll-full" className={cn(buttonVariants({ variant: "outline" }))}>Export bank (admin)</a>
          </div>
        }
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" placeholder="Search employee" defaultValue={q} />
        <Input name="month" type="number" min={1} max={12} placeholder="Month" defaultValue={sp.month ?? ""} />
        <Input name="year" type="number" placeholder="Year" defaultValue={sp.year ?? ""} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <Card className="mb-6">
        <CardHeader><CardTitle>Add / update salary</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={upsertSalaryAction} className="grid gap-3 sm:grid-cols-4">
            <Field label="Employee">
              <select name="employeeId" className="h-8 w-full rounded-lg border px-2 text-sm" required>
                {options.items.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </Field>
            <Field label="Month"><Input name="month" type="number" min={1} max={12} required defaultValue={new Date().getMonth() + 1} /></Field>
            <Field label="Year"><Input name="year" type="number" required defaultValue={new Date().getFullYear()} /></Field>
            <Field label="Amount (INR)"><Input name="amount" type="number" required /></Field>
            <Field label="Base salary"><Input name="baseSalary" type="number" /></Field>
            <Field label="Bonus"><Input name="bonuses" type="number" /></Field>
            <Field label="Deductions"><Input name="deductions" type="number" /></Field>
            <Field label="Notes"><Input name="notes" /></Field>
            <Field label="Status">
              <select name="status" className="h-8 w-full rounded-lg border px-2 text-sm">
                <option>PENDING</option>
                <option>PROCESSING</option>
                <option>PAID</option>
                <option>FAILED</option>
              </select>
            </Field>
            <Field label="Payment date"><Input type="date" name="paymentDate" /></Field>
            <Field label="Reference"><Input name="paymentRef" /></Field>
            <Field label="Payslip"><Input type="file" name="payslip" /></Field>
            <Button type="submit">Save salary</Button>
          </ActionForm>
        </CardContent>
      </Card>
      {employees.length === 0 ? (
        <EmptyState title="No employees yet." description="Create an employee first. Salary records are only created when you save payroll here." />
      ) : employees.map((e) => (
        <Card key={e.id} className="mb-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{e.fullName} · {e.employeeCode}</CardTitle>
            {e.bankDetails ? <StatusBadge value={e.bankDetails.status} /> : <span className="text-xs text-muted-foreground">No bank details</span>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {e.bankDetails ? (
              <p>
                {e.bankDetails.bankName} · {e.bankDetails.accountNumberMasked} · {e.bankDetails.ifsc} · PAN {e.bankDetails.panMasked}
              </p>
            ) : null}
            {e.bankDetails && e.bankDetails.status !== "VERIFIED" ? (
              <div className="flex gap-2">
                <ConfirmButton label="Verify bank" title="Verify" description="Approve these payroll details." action={verifyBankDetailsAction.bind(null, e.id, "VERIFIED")} />
                <ConfirmButton label="Reject" title="Reject" description="Ask the employee to resubmit." variant="destructive" action={verifyBankDetailsAction.bind(null, e.id, "REJECTED")} />
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payslip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.salaryRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No salary records available yet.</TableCell>
                  </TableRow>
                ) : (
                  e.salaryRecords.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{monthName(s.month)} {s.year}</TableCell>
                    <TableCell>{formatInr(s.amount)}</TableCell>
                    <TableCell><StatusBadge value={s.status} /></TableCell>
                    <TableCell>
                      {s.payslipFileId ? <a className="text-primary underline" href={`/api/files/${s.payslipFileId}`}>Download</a> : "—"}
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / (data.limit || 25)))} total={data.total} extra={{ q, month: sp.month, year: sp.year }} />
    </div>
  );
}
