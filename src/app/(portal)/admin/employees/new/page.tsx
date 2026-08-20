import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createEmployeeAction } from "@/server/actions/employees";
import { dateKeyInTz } from "@/lib/dates";

export default function NewEmployeePage() {
  return (
    <div>
      <PageHeader
        title="Add employee"
        description="Creates an invited account with verification Not started. No salary, attendance, tasks, or leave balances are created until verification is approved."
      />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <ActionForm action={createEmployeeAction} successRedirect="/admin/employees" className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input name="fullName" required />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Phone">
              <Input name="phone" required />
            </Field>
            <Field label="Employee ID" hint="Optional. Leave blank to auto-assign the next DZ- number.">
              <Input name="employeeCode" />
            </Field>
            <Field label="Joining date">
              <Input type="date" name="joiningDate" defaultValue={dateKeyInTz()} required />
            </Field>
            <Field label="Department">
              <Input name="department" required />
            </Field>
            <Field label="Designation">
              <Input name="designation" required />
            </Field>
            <Field label="Username" hint="Optional. Defaults from the email prefix.">
              <Input name="username" />
            </Field>
            <div className="sm:col-span-2 text-sm text-muted-foreground">
              The employee receives a one-time invitation to set their own password. A password is never shown here.
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create employee</Button>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
