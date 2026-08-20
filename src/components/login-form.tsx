"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import type { ActionResult } from "@/lib/action";

export function LoginForm() {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult | undefined, formData: FormData) => loginAction(formData),
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Email or username" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" required placeholder="you@dropzen.com" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="text-center text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
    </form>
  );
}
