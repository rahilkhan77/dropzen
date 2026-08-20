import { notFound } from "next/navigation";
import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { startTaskAction, submitWorkAction } from "@/server/actions/tasks";
import { formatDateTime } from "@/lib/dates";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApprovedEmployee();
  const { id } = await params;
  type FileRow = { id: string; kind: string; fileId: string; file: { originalName: string } };
  type Version = { id: string; version: number; fileId: string; comments: string | null; file: { originalName: string } };
  type Assignment = {
    id: string;
    status: string;
    employeeId: string;
    employee?: { fullName: string };
    submissions: { comments: string | null; feedback: string | null; versions: Version[] }[];
  };
  type TaskShape = {
    id: string;
    title: string;
    dateKey: string;
    deadline: string;
    priority: string;
    instructions: string;
    notes: string | null;
    estimatedHours: number | null;
    files: FileRow[];
    assignments: Assignment[];
  };

  let task: TaskShape | null = null;
  if (user.role === "ADMIN") {
    task = await apiGet<TaskShape>(`/api/admin/tasks/${id}`);
  } else {
    const assignment = await apiGet<Assignment & { task: TaskShape }>(`/api/employee/tasks/${id}`);
    task = {
      ...assignment.task,
      assignments: [assignment],
    };
  }
  if (!task) notFound();

  const assignment =
    user.role === "ADMIN"
      ? task.assignments[0]
      : task.assignments.find((a) => a.employeeId === user.employeeId);
  if (!assignment && user.role !== "ADMIN") notFound();

  const mine = task.assignments.find((a) => a.employeeId === user.employeeId);
  const templates = task.files.filter((f) => f.kind === "TEMPLATE");
  const references = task.files.filter((f) => f.kind === "REFERENCE");

  return (
    <div>
      <PageHeader
        title={task.title}
        description={`Date ${task.dateKey} · Deadline ${formatDateTime(task.deadline)}`}
        actions={
          <div className="flex gap-2">
            <StatusBadge value={task.priority} />
            {mine ? <StatusBadge value={mine.status} /> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm leading-6">{task.instructions}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {templates.map((f) => (
              <a key={f.id} className="block text-primary underline" href={`/api/files/${f.fileId}`}>
                Download template: {f.file.originalName}
              </a>
            ))}
            {references.map((f) => (
              <a key={f.id} className="block text-primary underline" href={`/api/files/${f.fileId}`}>
                Reference: {f.file.originalName}
              </a>
            ))}
            {!task.files.length ? <p className="text-muted-foreground">No files attached.</p> : null}
            {task.notes ? <p className="pt-2 text-muted-foreground">Notes: {task.notes}</p> : null}
            {task.estimatedHours ? <p>Estimated: {task.estimatedHours} hours</p> : null}
          </CardContent>
        </Card>
      </div>

      {mine ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Submit work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mine.status === "ASSIGNED" || mine.status === "OVERDUE" ? (
              <ActionForm action={startTaskAction.bind(null, mine.id)}>
                <Button type="submit">Start task</Button>
              </ActionForm>
            ) : null}
            <ActionForm action={submitWorkAction.bind(null, mine.id)} className="space-y-3">
              <Field label="Completed Excel / CSV">
                <Input type="file" name="file" accept=".xlsx,.xls,.csv" required />
              </Field>
              <Field label="Comments">
                <Textarea name="comments" placeholder="Anything the reviewer should know?" />
              </Field>
              <Button type="submit">Submit work</Button>
            </ActionForm>
            {mine.submissions[0]?.versions?.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Submission history</p>
                {mine.submissions[0].versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                    <span>
                      v{v.version} · {v.file.originalName}
                      {v.comments ? ` · ${v.comments}` : ""}
                    </span>
                    <a className="text-primary underline" href={`/api/files/${v.fileId}`}>
                      Download
                    </a>
                  </div>
                ))}
                {mine.submissions[0].feedback ? (
                  <p className="text-sm">Reviewer feedback: {mine.submissions[0].feedback}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {user.role === "ADMIN" ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {task.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{a.employee?.fullName ?? "Employee"}</p>
                  <p className="text-muted-foreground">{a.submissions[0]?.comments ?? "No comments"}</p>
                </div>
                <StatusBadge value={a.status} />
              </div>
            ))}
            <a className="text-sm text-primary underline" href={`/admin/tasks/${task.id}`}>
              Open admin review
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
