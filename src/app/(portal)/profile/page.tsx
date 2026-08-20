import Link from "next/link";
import { requireEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { profileCompletion } from "@/lib/profile";
import { toDateInput } from "@/lib/dates";
import { parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { updateOwnProfileAction } from "@/server/actions/profile";
import { cn } from "@/lib/utils";

export default async function ProfilePage() {
  const user = await requireEmployee();
  const employee = await apiGet<{
    fullName: string;
    photoFileId: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    joiningDate: string;
    employeeCode: string;
    department: string | null;
    designation: string | null;
    skills: string;
    user: { email: string };
  }>("/api/employee/profile");
  const pct = profileCompletion(employee);
  const skills = parseJson<string[]>(employee.skills, []).join(", ");

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Update personal details. Company fields are managed by admin."
        actions={
          <Link href="/change-password" className={cn(buttonVariants({ variant: "outline" }))}>
            Change password
          </Link>
        }
      />
      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="mb-2 text-sm">Profile completion · {pct}%</p>
          <Progress value={pct} />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Company record</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Employee ID: {employee.employeeCode}</p>
            <p>Email: {employee.user.email}</p>
            <p>Department: {employee.department}</p>
            <p>Designation: {employee.designation}</p>
            <p>Joining date: {toDateInput(employee.joiningDate)}</p>
            {employee.photoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${employee.photoFileId}`} alt="" className="mt-2 size-24 rounded-xl object-cover" />
            ) : null}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Editable details</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateOwnProfileAction} className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <Input name="fullName" defaultValue={employee.fullName} required />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={employee.phone ?? ""} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" name="dateOfBirth" defaultValue={toDateInput(employee.dateOfBirth)} />
              </Field>
              <Field label="Emergency contact">
                <Input name="emergencyName" defaultValue={employee.emergencyName ?? ""} />
              </Field>
              <Field label="Emergency phone">
                <Input name="emergencyPhone" defaultValue={employee.emergencyPhone ?? ""} />
              </Field>
              <Field label="Photo">
                <Input type="file" name="photo" accept="image/*" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <Textarea name="address" defaultValue={employee.address ?? ""} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Skills" hint="Comma separated">
                  <Input name="skills" defaultValue={skills} />
                </Field>
              </div>
              <Button type="submit">Save profile</Button>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
