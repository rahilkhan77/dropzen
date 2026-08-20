"use client";

import { useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { resetPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import type { ActionResult } from "@/lib/action";

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult | undefined, formData: FormData) => resetPasswordAction(formData),
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => router.push("/login"), 1200);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password">
        <Input id="password" name="password" type="password" required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" required />
      </Field>
      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
      <Button type="submit" className="w-full" disabled={pending || !token}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
