import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { BrandMark } from "@/components/brand";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changePasswordAction } from "@/server/actions/auth";

export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandMark />
          <CardTitle>Change password</CardTitle>
          <CardDescription>For new accounts, set a password only you know before using DropZen.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changePasswordAction} successRedirect="/login" className="space-y-4">
            <Field label="Current password" htmlFor="currentPassword">
              <Input id="currentPassword" name="currentPassword" type="password" required />
            </Field>
            <Field label="New password" htmlFor="newPassword">
              <Input id="newPassword" name="newPassword" type="password" required />
            </Field>
            <Field label="Confirm new password" htmlFor="confirmPassword">
              <Input id="confirmPassword" name="confirmPassword" type="password" required />
            </Field>
            <Button type="submit" className="w-full">
              Update password
            </Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
