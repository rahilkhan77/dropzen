"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";

type Props = {
  action: (formData: FormData) => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  className?: string;
  successRedirect?: string;
};

export function ActionForm({ action, children, className, successRedirect }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult<unknown> | undefined, formData: FormData) => action(formData),
    undefined as ActionResult<unknown> | undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (successRedirect) {
        window.location.assign(successRedirect);
        return;
      }
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router, successRedirect]);

  return (
    <form action={formAction} className={cn(className, pending && "pointer-events-none opacity-80")}>
      {children}
    </form>
  );
}
