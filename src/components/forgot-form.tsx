"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import type { ActionResult } from "@/lib/action";

export function ForgotForm() {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult<{ resetUrl?: string }> | undefined, formData: FormData) =>
      forgotPasswordAction(formData),
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Email or username" htmlFor="identifier">
        <Input id="identifier" name="identifier" required />
      </Field>
      {state?.ok ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p>{state.message}</p>
          {state.data?.resetUrl ? (
            <p className="mt-2 break-all">
              Demo reset link:{" "}
              <Link className="underline" href={state.data.resetUrl}>
                {state.data.resetUrl}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
