import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    items: { id: string; employeeCode: string; fullName: string; department: string | null; designation: string | null; kycStatus: string; user: { email: string; status: string } }[];
    total: number;
    limit?: number;
  }>(`/api/admin/employees?q=${encodeURIComponent(q)}&page=${page}&limit=25`);
  const rows = data.items;
  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / (data.limit ?? 25)));

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Create accounts, disable access, and open an employee record."
        actions={
          <Link href="/admin/employees/new" className={cn(buttonVariants())}>
            Add employee
          </Link>
        }
      />
      <form className="mb-4 flex gap-2" method="get">
        <Input name="q" placeholder="Search name, email, ID…" defaultValue={q} />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {q ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing results for {q}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Verification</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>
                <EmptyState
                  title={q ? "No matching employees." : "No employees yet."}
                  description={
                    q
                      ? "Try a different name, email, or employee ID."
                      : "Use Add employee to create the first account. Nothing is pre-seeded."
                  }
                />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link className="text-primary" href={`/admin/employees/${e.id}`}>
                    {e.employeeCode}
                  </Link>
                </TableCell>
                <TableCell>{e.fullName}</TableCell>
                <TableCell>{e.user.email}</TableCell>
                <TableCell>
                  {e.department} · {e.designation}
                </TableCell>
                <TableCell>
                  <Link href={`/admin/verification/${e.id}`}>
                    <StatusBadge value={e.kycStatus} />
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge value={e.user.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination page={page} pages={pages} total={total} extra={{ q }} />
    </div>
  );
}
