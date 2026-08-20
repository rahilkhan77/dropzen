"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";

export function ConfirmButton({
  label,
  title,
  description,
  action,
  variant = "outline",
}: {
  label: string;
  title: string;
  description: string;
  action: () => Promise<ActionResult<unknown>>;
  variant?: "outline" | "destructive" | "default" | "secondary";
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <AlertDialog>
      <AlertDialogTrigger className={cn(buttonVariants({ variant }), pending && "opacity-50")} disabled={pending}>
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const result = await action();
                if (result.ok) {
                  toast.success(result.message ?? "Done");
                  router.refresh();
                } else toast.error(result.error);
              })
            }
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
