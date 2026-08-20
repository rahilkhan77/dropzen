import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { dateKeyInTz } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTaskAction } from "@/server/actions/tasks";

export default async function NewTaskPage() {
  await requireAdmin();
  const { items: employees } = await apiGet<{ items: { id: string; fullName: string; employeeCode: string }[] }>(
    "/api/admin/employees/options",
  );
  const today = dateKeyInTz();

  return (
    <div>
      <PageHeader title="Create task" description="Assign to one or many employees. Optionally repeat every working day." />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <ActionForm action={createTaskAction} successRedirect="/admin/tasks" className="space-y-4">
            <Field label="Title">
              <Input name="title" required />
            </Field>
            <Field label="Description">
              <Textarea name="description" rows={3} />
            </Field>
            <Field label="Instructions">
              <Textarea name="instructions" required rows={6} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Work date">
                <Input type="date" name="dateKey" defaultValue={today} required />
              </Field>
              <Field label="Deadline">
                <Input type="datetime-local" name="deadline" required />
              </Field>
              <Field label="Priority">
                <select name="priority" className="h-8 w-full rounded-lg border px-2 text-sm" defaultValue="MEDIUM">
                  <option>LOW</option>
                  <option>MEDIUM</option>
                  <option>HIGH</option>
                  <option>URGENT</option>
                </select>
              </Field>
              <Field label="Estimated hours">
                <Input name="estimatedHours" type="number" step="0.5" defaultValue="4" />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea name="notes" />
            </Field>
            <Field label="Excel / CSV template">
              <Input type="file" name="template" accept=".xlsx,.xls,.csv" />
            </Field>
            <Field label="Reference files">
              <Input type="file" name="references" multiple />
            </Field>
            <Field label="Assign to">
              <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                {employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No employees yet. Create an employee first.</p>
                ) : (
                  employees.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="employeeIds" value={e.id} className="size-4 rounded border" />
                      {e.fullName} ({e.employeeCode})
                    </label>
                  ))
                )}
              </div>
            </Field>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" name="recurring" className="size-4 rounded border" /> Recurring
              <select name="frequency" className="h-8 rounded-lg border px-2 text-sm">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <Button type="submit">Assign Task</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
