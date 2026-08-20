import type { Metadata } from "next";
import { BrandMark } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyBranding } from "@/lib/company";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const branding = await getCompanyBranding();
  const companyName = branding.name;
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,oklch(0.72_0.12_175/0.25),transparent_40%),radial-gradient(circle_at_bottom_right,oklch(0.4_0.08_240/0.2),transparent_45%)] px-4 py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <BrandMark name={companyName} logoUrl={branding.logoUrl} />
          <div>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to the {companyName} employee portal. Accounts are created by your admin — there is no public signup.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">{companyName} · Internal operations</p>
    </div>
  );
}
