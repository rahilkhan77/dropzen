import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const status = sp.status ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    items: {
      id: string;
      title: string;
      dateKey: string;
      priority: string;
      deadline: string;
      assignments: { id: string; status: string; employee: { fullName: string; employeeCode: string } }[];
    }[];
    total: number;
    limit: number;
  }>(`/api/admin/tasks?q=${encodeURIComponent(q)}&page=${page}&limit=25`);
  const tasks = data.items;
  const assignments = tasks.flatMap((task) =>
    task.assignments.map((a) => ({ ...a, task })),
  ).filter((a) => {
    if (status && a.status !== status) return false;
    if (q && !a.task.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const total = assignments.length;
  const completed = assignments.filter((a) => ["COMPLETED", "APPROVED"].includes(a.status)).length;
  const overdue = assignments.filter((a) => a.status === "OVERDUE").length;
  const review = assignments.filter((a) => ["SUBMITTED", "UNDER_REVIEW"].includes(a.status)).length;

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Assign Excel work, track submissions, and review files."
        actions={
          <Link href="/admin/tasks/new" className={cn(buttonVariants())}>
            Create task
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Assignments" value={total} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="Overdue" value={overdue} />
        <StatCard label="Under review" value={review} hint={`${total ? Math.round((completed / total) * 100) : 0}% done`} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <Input name="q" placeholder="Search title" defaultValue={q} />
        <select name="status" defaultValue={status} className="h-8 rounded-lg border px-2 text-sm">
          <option value="">All statuses</option>
          {["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "REVISION_REQUIRED", "COMPLETED", "OVERDUE"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>
                <EmptyState title="No tasks assigned yet." description="Create a task and assign it to employees. Nothing is preloaded." />
              </TableCell>
            </TableRow>
          ) : (
            assignments.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link className="text-primary" href={`/admin/tasks/${a.task.id}`}>
                  {a.task.title}
                </Link>
              </TableCell>
              <TableCell>{a.employee.fullName}</TableCell>
              <TableCell>{a.task.dateKey}</TableCell>
              <TableCell>
                <StatusBadge value={a.status} />
              </TableCell>
            </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / (data.limit || 25)))} total={data.total} extra={{ q, status }} />
    </div>
  );
}
