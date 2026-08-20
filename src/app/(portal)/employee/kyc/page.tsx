import { requireEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { KycWizard, type KycPayload } from "@/components/kyc-wizard";

export const dynamic = "force-dynamic";

export default async function EmployeeVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  await requireEmployee();
  const data = await apiGet<KycPayload>("/api/employee/kyc");
  const sp = await searchParams;
  const parsed = Number.parseInt(sp.step ?? "0", 10);
  const initialStep = Number.isFinite(parsed) ? parsed : 0;

  const needsUpdates =
    Boolean(data.kycRejectionReason) &&
    data.kycStatus !== "APPROVED" &&
    data.kycStatus !== "PENDING_VERIFICATION";

  return (
    <div>
      <PageHeader
        title="Employee verification"
        description="Complete your details so payroll, attendance, and tasks can be enabled. Sensitive numbers are encrypted and masked after you save."
      />
      {needsUpdates ? (
        <div role="alert" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="font-medium">{data.kycStatus === "REJECTED" ? "Verification rejected" : "Updates requested"}</p>
          <p className="mt-1 text-sm">{data.kycRejectionReason}</p>
        </div>
      ) : null}
      <KycWizard initial={data} initialStep={initialStep} />
    </div>
  );
}
