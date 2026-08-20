import { Suspense } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { ResetForm } from "@/components/reset-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandMark />
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Use at least 8 characters with upper, lower, and a number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense>
            <ResetForm />
          </Suspense>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
