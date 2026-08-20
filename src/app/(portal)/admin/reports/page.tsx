import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const exports = [
  { href: "/api/export/employees", title: "Employee list", body: "Directory without bank details." },
  { href: "/api/export/attendance", title: "Attendance", body: "Check-in history for all employees." },
  { href: "/api/export/tasks", title: "Task completions", body: "Assignment status report." },
  { href: "/api/export/completions", title: "Completion report", body: "Same as task report, named for payroll ops." },
  { href: "/api/export/leave", title: "Leave records", body: "Requests and decisions." },
  { href: "/api/export/payroll", title: "Payroll", body: "Salary rows with masked accounts." },
  { href: "/api/export/payroll-full", title: "Bank details (restricted)", body: "Full account numbers for finance. Admin only." },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Download Excel workbooks for operations and finance." />
      <div className="grid gap-4 sm:grid-cols-2">
        {exports.map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">{item.body}</p>
              <div className="flex gap-2">
                <a href={item.href} className={cn(buttonVariants())}>Download .xlsx</a>
                <a href={`${item.href}?format=csv`} className={cn(buttonVariants({ variant: "outline" }))}>CSV</a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
