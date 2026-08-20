import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ShellFrame } from "@/components/shell-frame";
import { LiveUpdates } from "@/components/live-updates";
import { getCompanyBranding } from "@/lib/company";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/change-password");
  const branding = await getCompanyBranding();
  return (
    <ShellFrame
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        photoUrl: user.photoFileId ? `/api/files/${user.photoFileId}` : null,
        employeeCode: user.employeeCode,
        kycStatus: user.kycStatus,
      }}
      unread={user.unread}
      companyName={branding.name}
      companyLogoUrl={branding.logoUrl}
    >
      {user.role === "EMPLOYEE" ? <LiveUpdates /> : null}
      {children}
    </ShellFrame>
  );
}
