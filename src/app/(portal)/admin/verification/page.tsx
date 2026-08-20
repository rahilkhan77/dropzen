import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AdminVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "PENDING_VERIFICATION";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    items: {
      id: string;
      employeeCode: string;
      fullName: string;
      email: string;
      department: string | null;
      kycStatus: string;
      kycSubmittedAt: string | null;
      progress: number;
    }[];
    total: number;
    limit: number;
  }>(
    `/api/admin/kyc?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status === "ALL" ? "" : status)}&page=${page}&limit=25`,
  );
  const rows = data.items;
  const pages = Math.max(1, Math.ceil(data.total / (data.limit || 25)));

  return (
    <div>
      <PageHeader title="Employee verification" description="Review submitted information before unlocking an employee workspace." />
      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, email, ID" />
        <select name="status" defaultValue={status} className="h-8 rounded-lg border px-2 text-sm">
          <option value="PENDING_VERIFICATION">Pending</option>
          <option value="ALL">All statuses</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="INCOMPLETE">Incomplete</option>
          <option value="NOT_STARTED">Not started</option>
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title={status === "PENDING_VERIFICATION" ? "No pending verifications." : "No matching employees."}
          description="Submitted employee verification appears here for review."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link className="text-primary" href={`/admin/verification/${row.id}`}>
                    {row.employeeCode}
                  </Link>
                </TableCell>
                <TableCell>{row.fullName}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell>{row.kycSubmittedAt ? String(row.kycSubmittedAt).slice(0, 10) : "—"}</TableCell>
                <TableCell>{row.progress}%</TableCell>
                <TableCell><StatusBadge value={row.kycStatus} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} total={data.total} extra={{ q, status }} />
    </div>
  );
}
