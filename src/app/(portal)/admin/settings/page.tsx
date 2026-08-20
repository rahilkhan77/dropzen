import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateSettingsAction, upsertLeaveTypeAction } from "@/server/actions/settings";

const DAYS = [
  { v: 0, l: "Sun" },
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
];

export default async function SettingsPage() {
  await requireAdmin();
  const data = await apiGet<{
    settings: {
      companyName: string;
      legalName: string;
      timezone: string;
      currency: string;
      workStart: string;
      workEnd: string;
      lateAfter: string;
      halfDayAfter: string;
      workingDays: number[];
      defaultTaskHours: number;
      notifyDeadlineHours: number;
      payCycleDay: number;
      companyEmail: string | null;
      companyPhone: string | null;
      companyAddress: string | null;
      website: string | null;
      logoFileId: string | null;
      sessionTtlHours: number;
      passwordMinLength: number;
      loginRateLimit: number;
      emailNotifications: boolean;
      inAppNotifications: boolean;
    };
    leaveTypes: { id: string; name: string; daysPerYear: number; paid: boolean; carryForward: boolean }[];
  }>("/api/admin/settings");
  const settings = data.settings;
  const types = data.leaveTypes;

  return (
    <div>
      <PageHeader title="Settings" description="Company identity, working hours, leave, payroll, security, and notifications." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Company</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updateSettingsAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name"><Input name="companyName" defaultValue={settings.companyName} /></Field>
              <Field label="Legal name"><Input name="legalName" defaultValue={settings.legalName} /></Field>
              <Field label="Email"><Input name="companyEmail" defaultValue={settings.companyEmail ?? ""} /></Field>
              <Field label="Phone"><Input name="companyPhone" defaultValue={settings.companyPhone ?? ""} /></Field>
              <Field label="Website"><Input name="website" defaultValue={settings.website ?? ""} /></Field>
              <Field label="Logo">
                <Input type="file" name="logo" accept="image/png,image/jpeg" />
                {settings.logoFileId ? <p className="mt-1 text-xs text-muted-foreground">A logo is currently set. Upload a new file to replace it.</p> : null}
              </Field>
              <Field label="Timezone"><Input name="timezone" defaultValue={settings.timezone} /></Field>
              <div className="sm:col-span-2">
                <Field label="Address"><Input name="companyAddress" defaultValue={settings.companyAddress ?? ""} /></Field>
              </div>
              <CardHeader className="sm:col-span-2 px-0"><CardTitle>Working hours</CardTitle></CardHeader>
              <Field label="Start time"><Input type="time" name="workStart" defaultValue={settings.workStart} /></Field>
              <Field label="End time"><Input type="time" name="workEnd" defaultValue={settings.workEnd} /></Field>
              <Field label="Late threshold"><Input type="time" name="lateAfter" defaultValue={settings.lateAfter} /></Field>
              <Field label="Half day after"><Input type="time" name="halfDayAfter" defaultValue={settings.halfDayAfter} /></Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium">Working days</p>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((d) => (
                    <label key={d.v} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="workingDays" value={d.v} defaultChecked={settings.workingDays.includes(d.v)} />
                      {d.l}
                    </label>
                  ))}
                </div>
              </div>
              <CardHeader className="sm:col-span-2 px-0"><CardTitle>Payroll</CardTitle></CardHeader>
              <Field label="Salary cycle day"><Input type="number" name="payCycleDay" defaultValue={settings.payCycleDay} /></Field>
              <Field label="Currency"><Input name="currency" defaultValue={settings.currency} /></Field>
              <Field label="Default task hours"><Input type="number" name="defaultTaskHours" defaultValue={settings.defaultTaskHours} /></Field>
              <Field label="Deadline reminder (hours)"><Input type="number" name="notifyDeadlineHours" defaultValue={settings.notifyDeadlineHours} /></Field>
              <CardHeader className="sm:col-span-2 px-0"><CardTitle>Security</CardTitle></CardHeader>
              <Field label="Session timeout (hours)"><Input type="number" name="sessionTtlHours" defaultValue={settings.sessionTtlHours} /></Field>
              <Field label="Password min length"><Input type="number" name="passwordMinLength" defaultValue={settings.passwordMinLength} /></Field>
              <Field label="Login rate limit / 15 min"><Input type="number" name="loginRateLimit" defaultValue={settings.loginRateLimit} /></Field>
              <CardHeader className="sm:col-span-2 px-0"><CardTitle>Notifications</CardTitle></CardHeader>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="emailNotifications" defaultChecked={settings.emailNotifications} /> Email notifications
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="inAppNotifications" defaultChecked={settings.inAppNotifications} /> In-app notifications
              </label>
              <Button type="submit">Save settings</Button>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leave types</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {types.map((t) => (
              <ActionForm key={t.id} action={upsertLeaveTypeAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Name"><Input name="name" defaultValue={t.name} /></Field>
                <Field label="Days / year"><Input name="daysPerYear" type="number" defaultValue={t.daysPerYear} /></Field>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="paid" defaultChecked={t.paid} /> Paid
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="carryForward" defaultChecked={t.carryForward} /> Carry forward
                </label>
                <Button type="submit" variant="outline">Update</Button>
              </ActionForm>
            ))}
            <ActionForm action={upsertLeaveTypeAction} className="flex flex-wrap items-end gap-2 border-t pt-4">
              <Field label="New type"><Input name="name" required /></Field>
              <Field label="Days"><Input name="daysPerYear" type="number" required /></Field>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="paid" defaultChecked /> Paid
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="carryForward" /> Carry forward
              </label>
              <Button type="submit">Add</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
