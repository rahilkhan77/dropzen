import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { ForgotForm } from "@/components/forgot-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandMark />
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email or username. If email delivery is not configured, a reset link may be shown on the next screen for this environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ForgotForm />
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
