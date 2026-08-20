import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/server/actions/notifications";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await apiGet<{ id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string }[]>("/api/notifications");

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Task, leave, payroll and announcement alerts."
        actions={
          <ActionForm action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline">
              Mark all read
            </Button>
          </ActionForm>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="You're all caught up." description="Task, verification, leave, and payroll alerts will appear here when they are created." />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <Card key={n.id} className={cn(!n.readAt && "ring-1 ring-primary/30")}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                  {n.href ? (
                    <Link href={n.href} className="mt-2 inline-block text-sm text-primary">
                      Open
                    </Link>
                  ) : null}
                </div>
                {!n.readAt ? (
                  <ActionForm action={markNotificationReadAction.bind(null, n.id)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Read
                    </Button>
                  </ActionForm>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
