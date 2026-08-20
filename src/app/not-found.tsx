import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <BrandMark />
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/dashboard" className={cn(buttonVariants())}>
        Go to dashboard
      </Link>
    </div>
  );
}
