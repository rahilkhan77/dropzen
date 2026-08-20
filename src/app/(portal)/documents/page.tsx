import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { DOCUMENT_LABELS, EMPLOYEE_UPLOAD_CATEGORIES } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { employeeUploadDocumentAction } from "@/server/actions/documents";

export default async function DocumentsPage() {
  const user = await requireApprovedEmployee();
  const docs = await apiGet<{ id: string; title: string; category: string; fileId: string }[]>("/api/documents");

  return (
    <div>
      <PageHeader title="Documents" description="ID, contracts, payslips and other files shared with you." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Your files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {docs.length === 0 ? (
              <EmptyState title="No documents uploaded." description="Files shared with you or uploaded after verification will appear here." />
            ) : (
              docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-muted-foreground">{DOCUMENT_LABELS[d.category]}</p>
                  </div>
                  <a className="text-primary underline" href={`/api/files/${d.fileId}`}>
                    Download
                  </a>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={employeeUploadDocumentAction} className="space-y-3">
              <Field label="Title">
                <Input name="title" required />
              </Field>
              <Field label="Category">
                <select name="category" className="h-8 w-full rounded-lg border px-2 text-sm">
                  {EMPLOYEE_UPLOAD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {DOCUMENT_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="File">
                <Input type="file" name="file" required />
              </Field>
              <Button type="submit">Upload</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
