import Link from "next/link";
import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { dateKeyInTz } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

function TaskList({ items, empty }: { items: { id: string; status: string; task: { id: string; title: string; dateKey: string; priority: string; deadline: string } }[]; empty: string }) {
  if (!items.length) return <EmptyState title={empty} description="This list is filled from assignments stored in the database." />;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link key={item.id} href={`/tasks/${item.task.id}`}>
          <Card className="transition hover:bg-muted/40">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{item.task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.task.dateKey} · due {new Date(item.task.deadline).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={item.task.priority} />
                <StatusBadge value={item.status} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default async function TasksPage() {
  const user = await requireApprovedEmployee();
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  const assignments = await apiGet<{ id: string; status: string; task: { id: string; title: string; dateKey: string; priority: string; deadline: string } }[]>("/api/employee/tasks");
  const todayTasks = assignments.filter((a) => a.task.dateKey === today);
  const upcoming = assignments.filter((a) => a.task.dateKey > today && !["COMPLETED", "APPROVED"].includes(a.status));
  const pending = assignments.filter((a) => a.status === "ASSIGNED");
  const inProgress = assignments.filter((a) => a.status === "IN_PROGRESS");
  const underReview = assignments.filter((a) => ["SUBMITTED", "UNDER_REVIEW"].includes(a.status));
  const revision = assignments.filter((a) => a.status === "REVISION_REQUIRED");
  const overdue = assignments.filter((a) => a.status === "OVERDUE" || (new Date(a.task.deadline) < new Date() && !["COMPLETED", "APPROVED", "SUBMITTED", "UNDER_REVIEW"].includes(a.status)));
  const completed = assignments.filter((a) => ["COMPLETED", "APPROVED"].includes(a.status));

  return (
    <div>
      <PageHeader title="My tasks" description="Only work assigned to you. Statuses come from your assignments in the database." />
      {assignments.length === 0 ? (
        <EmptyState title="No tasks assigned to you yet." description="When an administrator assigns a task, it will show up here automatically." />
      ) : (
      <Tabs defaultValue="today">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="today">Today ({todayTasks.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="progress">In progress ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="review">Under review ({underReview.length})</TabsTrigger>
          <TabsTrigger value="revision">Revision ({revision.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4"><TaskList items={todayTasks} empty="No tasks for today." /></TabsContent>
        <TabsContent value="upcoming" className="mt-4"><TaskList items={upcoming} empty="No upcoming tasks." /></TabsContent>
        <TabsContent value="pending" className="mt-4"><TaskList items={pending} empty="No pending tasks." /></TabsContent>
        <TabsContent value="progress" className="mt-4"><TaskList items={inProgress} empty="No tasks in progress." /></TabsContent>
        <TabsContent value="review" className="mt-4"><TaskList items={underReview} empty="No submissions under review." /></TabsContent>
        <TabsContent value="revision" className="mt-4"><TaskList items={revision} empty="No revisions required." /></TabsContent>
        <TabsContent value="overdue" className="mt-4"><TaskList items={overdue} empty="Nothing overdue." /></TabsContent>
        <TabsContent value="done" className="mt-4"><TaskList items={completed} empty="No completed tasks yet." /></TabsContent>
      </Tabs>
      )}
    </div>
  );
}
