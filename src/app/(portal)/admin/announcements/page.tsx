import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { dateKeyInTz } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/server/actions/announcements";

export default async function AnnouncementsPage() {
  await requireAdmin();
  const rows = await apiGet<{ id: string; title: string; message: string; priority: string; publishDate: string; attachmentId?: string | null }[]>("/api/admin/announcements");

  return (
    <div>
      <PageHeader title="Announcements" description="Published notes appear on every employee dashboard." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>New announcement</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createAnnouncementAction} className="space-y-3">
              <Field label="Title"><Input name="title" required /></Field>
              <Field label="Message"><Textarea name="message" required /></Field>
              <Field label="Priority">
                <select name="priority" className="h-8 w-full rounded-lg border px-2 text-sm" defaultValue="NORMAL">
                  <option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option>
                </select>
              </Field>
              <Field label="Publish date"><Input type="date" name="publishDate" defaultValue={dateKeyInTz()} /></Field>
              <Field label="Attachment"><Input type="file" name="attachment" /></Field>
              <Button type="submit">Publish</Button>
            </ActionForm>
          </CardContent>
        </Card>
        <div className="space-y-3 lg:col-span-2">
          {rows.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{a.publishDate}</p>
                </div>
                <StatusBadge value={a.priority} />
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{a.message}</p>
                {a.attachmentId ? <a className="text-primary underline" href={`/api/files/${a.attachmentId}`}>Attachment</a> : null}
                <ConfirmButton label="Delete" title="Delete announcement" description="Employees will no longer see this note." variant="destructive" action={deleteAnnouncementAction.bind(null, a.id)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
