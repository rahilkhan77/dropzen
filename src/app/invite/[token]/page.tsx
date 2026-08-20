import { BrandMark } from "@/components/brand";
import { InviteForm } from "@/components/invite-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(`${BACKEND}/api/auth/invite/${encodeURIComponent(token)}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { valid?: boolean; companyName?: string; fullName?: string; email?: string };
  };
  const info = json.data;
  const companyName = info?.companyName || "DropZen";

  if (!info?.valid) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <BrandMark name={companyName} />
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>
              This invitation is invalid, expired, or has already been used. Ask your administrator to resend it.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandMark name={companyName} />
          <CardTitle>Activate your account</CardTitle>
          <CardDescription>
            Hi {info.fullName}. Set a password for {info.email}, then continue to employee verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
