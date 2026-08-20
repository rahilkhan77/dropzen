import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));
  const data = await apiGet<{
    items: { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; ip: string | null; actor: { email: string } | null }[];
    total: number;
  }>(`/api/admin/audit?q=${encodeURIComponent(q)}&page=${page}`);
  const rows = data.items;
  const total = data.total;

  return (
    <div>
      <PageHeader title="Audit logs" description="Important actions with actor and timestamp." />
      <form method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search action, entity, email" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{r.action}</p>
            <p className="text-muted-foreground">
              {formatDateTime(r.createdAt)} · {r.actor?.email ?? "system"} · {r.entityType}
              {r.entityId ? ` · ${r.entityId}` : ""}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Page {page} · {total} events
      </p>
    </div>
  );
}
