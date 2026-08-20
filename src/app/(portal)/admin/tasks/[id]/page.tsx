import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteTaskAction,
  duplicateTaskAction,
  requestRevisionAction,
  reviewSubmissionAction,
  updateTaskAction,
} from "@/server/actions/tasks";

export default async function AdminTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const task = await apiGet<{
    id: string;
    title: string;
    instructions: string;
    dateKey: string;
    deadline: string;
    priority: string;
    estimatedHours: number | null;
    notes: string | null;
    files: { id: string; kind: string; fileId: string; file: { originalName: string } }[];
    assignments: {
      id: string;
      status: string;
      employee: { fullName: string };
      submissions: { id: string; comments: string | null; feedback: string | null; versions: { id: string; version: number; fileId: string; file: { originalName: string } }[] }[];
    }[];
  }>(`/api/admin/tasks/${id}`);

  return (
    <div>
      <PageHeader
        title={task.title}
        description={`${task.dateKey} · due ${formatDateTime(task.deadline)}`}
        actions={
          <div className="flex gap-2">
            <ConfirmButton
              label="Duplicate"
              title="Duplicate this task"
              description="Creates a copy with the same assignees."
              action={duplicateTaskAction.bind(null, task.id)}
            />
            <ConfirmButton
              label="Delete"
              title="Delete task"
              description="Assignments and submissions will be removed."
              variant="destructive"
              action={deleteTaskAction.bind(null, task.id)}
            />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Edit</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateTaskAction.bind(null, task.id)} className="space-y-3">
              <Field label="Title"><Input name="title" defaultValue={task.title} /></Field>
              <Field label="Instructions"><Textarea name="instructions" defaultValue={task.instructions} rows={5} /></Field>
              <Field label="Date"><Input type="date" name="dateKey" defaultValue={task.dateKey} /></Field>
              <Field label="Deadline"><Input type="datetime-local" name="deadline" /></Field>
              <Field label="Priority">
                <select name="priority" defaultValue={task.priority} className="h-8 w-full rounded-lg border px-2 text-sm">
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option>
                </select>
              </Field>
              <Field label="Add template"><Input type="file" name="template" accept=".xlsx,.xls,.csv" /></Field>
              <Button type="submit">Save</Button>
            </ActionForm>
            <div className="mt-4 space-y-1 text-sm">
              {task.files.map((f) => (
                <a key={f.id} className="block text-primary underline" href={`/api/files/${f.fileId}`}>
                  {f.kind}: {f.file.originalName}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {task.assignments.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{a.employee.fullName}</CardTitle>
                <StatusBadge value={a.status} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {a.submissions[0]?.versions.map((v) => (
                  <div key={v.id} className="flex justify-between rounded-lg border p-2">
                    <span>v{v.version} {v.file.originalName}</span>
                    <a className="text-primary underline" href={`/api/files/${v.fileId}`}>Download</a>
                  </div>
                ))}
                {a.submissions[0]?.comments ? <p>Comments: {a.submissions[0].comments}</p> : null}
                {["SUBMITTED", "UNDER_REVIEW", "REVISION_REQUIRED"].includes(a.status) || a.submissions.length ? (
                  <div className="flex flex-wrap gap-2">
                    <ConfirmButton label="Approve" title="Approve submission" description="Mark this assignment completed." action={reviewSubmissionAction.bind(null, a.id, "APPROVED")} />
                    <ReviewForm assignmentId={a.id} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ assignmentId }: { assignmentId: string }) {
  return (
    <ActionForm action={requestRevisionAction.bind(null, assignmentId)} className="flex gap-2">
      <Input name="feedback" placeholder="Revision notes" />
      <Button type="submit" variant="outline">Request revision</Button>
    </ActionForm>
  );
}
