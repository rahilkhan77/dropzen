import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { DOCUMENT_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { uploadDocumentAction } from "@/server/actions/documents";
import { Pagination } from "@/components/pagination";

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const [empData, docs] = await Promise.all([
    apiGet<{ items: { id: string; fullName: string }[] }>("/api/admin/employees/options"),
    apiGet<{
      items: { id: string; title: string; category: string; fileId: string; employee: { fullName: string } }[];
      total: number;
      limit: number;
    }>(`/api/admin/documents?q=${encodeURIComponent(q)}&page=${page}&limit=25`),
  ]);
  const employees = empData.items;
  const filtered = docs.items;

  return (
    <div>
      <PageHeader title="Documents" description="Upload employment files, contracts and payslips for an employee." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Upload for employee</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={uploadDocumentAction} className="space-y-3">
              <Field label="Employee">
                <select name="employeeId" className="h-8 w-full rounded-lg border px-2 text-sm" required>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </Field>
              <Field label="Title"><Input name="title" required /></Field>
              <Field label="Category">
                <select name="category" className="h-8 w-full rounded-lg border px-2 text-sm">
                  {Object.keys(DOCUMENT_LABELS).map((c) => <option key={c} value={c}>{DOCUMENT_LABELS[c]}</option>)}
                </select>
              </Field>
              <Field label="File"><Input type="file" name="file" required /></Field>
              <Button type="submit">Upload</Button>
            </ActionForm>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Library</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <form method="get" className="mb-3 flex gap-2">
              <Input name="q" defaultValue={q} placeholder="Search" />
              <Button variant="outline" type="submit">Search</Button>
            </form>
            {filtered.map((d) => (
              <a key={d.id} href={`/api/files/${d.fileId}`} className="flex justify-between rounded-lg border p-3 text-sm hover:bg-muted/40">
                <span>{d.employee.fullName} · {d.title}</span>
                <span className="text-muted-foreground">{DOCUMENT_LABELS[d.category]}</span>
              </a>
            ))}
            <Pagination page={page} pages={Math.max(1, Math.ceil(docs.total / (docs.limit || 25)))} total={docs.total} extra={{ q }} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
