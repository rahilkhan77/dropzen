import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatInr } from "@/lib/utils";
import { monthName } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function SalaryPage() {
  const user = await requireApprovedEmployee();
  const records = await apiGet<{
    id: string;
    month: number;
    year: number;
    amount: number;
    status: string;
    paymentDate: string | null;
    paymentRef: string | null;
    payslipFileId: string | null;
  }[]>("/api/employee/salary");
  const current = records[0];

  return (
    <div>
      <PageHeader title="Salary" description="Your compensation history and payslips." />
      {current ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>
              {monthName(current.month)} {current.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            <p className="text-3xl font-semibold">{formatInr(current.amount)}</p>
            <StatusBadge value={current.status} />
            {current.paymentDate ? <p className="text-sm text-muted-foreground">Paid on {current.paymentDate}</p> : null}
            {current.paymentRef ? <p className="text-sm">Ref: {current.paymentRef}</p> : null}
            {current.payslipFileId ? (
              <a className="text-sm text-primary underline" href={`/api/files/${current.payslipFileId}`}>
                Download payslip
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No salary records available yet." description="When payroll is published for you, amounts and payslips will appear here." />
      )}
      {records.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment date</TableHead>
              <TableHead>Payslip</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {monthName(r.month)} {r.year}
                </TableCell>
                <TableCell>{formatInr(r.amount)}</TableCell>
                <TableCell>
                  <StatusBadge value={r.status} />
                </TableCell>
                <TableCell>{r.paymentDate ?? "—"}</TableCell>
                <TableCell>
                  {r.payslipFileId ? (
                    <a className="text-primary underline" href={`/api/files/${r.payslipFileId}`}>
                      Download
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
