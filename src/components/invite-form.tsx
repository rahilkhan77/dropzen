"use client";

import { useActionState } from "react";
import { activateInviteAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import type { ActionResult } from "@/lib/action";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult | undefined, formData: FormData) => activateInviteAction(formData),
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Password" hint="At least 8 characters, with upper, lower, and a number.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password">
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Activating…" : "Activate account"}
      </Button>
    </form>
  );
}
