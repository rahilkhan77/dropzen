import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { DOCUMENT_LABELS } from "@/lib/constants";
import { approveKycAction, rejectKycAction, requestKycCorrectionAction } from "@/server/actions/kyc";
import type { KycPayload } from "@/components/kyc-wizard";

export default async function AdminVerificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const data = await apiGet<KycPayload & { employeeCode: string }>(`/api/admin/kyc/${id}`);
  if (!data) notFound();

  return (
    <div>
      <PageHeader
        title={data.personal.fullName}
        description={`${data.employeeCode} · ${data.personal.email}`}
        actions={<StatusBadge value={data.kycStatus} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Personal</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>DOB: {data.personal.dateOfBirth ? String(data.personal.dateOfBirth).slice(0, 10) : "—"}</p>
            <p>Gender: {data.personal.gender ?? "—"}</p>
            <p>Phone: {data.personal.phone ?? "—"}</p>
            <p>Address: {data.personal.address}, {data.personal.city}, {data.personal.state} {data.personal.pinCode}</p>
            <p>Emergency: {data.personal.emergencyName} {data.personal.emergencyPhone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Identity & bank</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>PAN: {data.identity.panMasked ?? "—"}</p>
            <p>ID: {data.identity.govIdType} {data.identity.govIdMasked}</p>
            <p>Bank: {data.bank ? `${data.bank.bankName} · ${data.bank.accountNumberMasked} · ${data.bank.ifsc}` : "—"}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.documents.length === 0 ? <p className="text-muted-foreground">No documents uploaded.</p> : data.documents.map((d) => (
            <a key={d.id} href={`/api/files/${d.fileId}`} className="block rounded-lg border p-2 hover:bg-muted/40">
              {d.title} · {DOCUMENT_LABELS[d.category] ?? d.category}
            </a>
          ))}
        </CardContent>
      </Card>
      {data.kycRejectionReason ? (
        <p className="mt-4 text-sm text-muted-foreground">Last admin note: {data.kycRejectionReason}</p>
      ) : null}
      {data.kycStatus === "PENDING_VERIFICATION" ? (
        <Card className="mt-4">
          <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ConfirmButton
              label="Approve"
              title="Approve verification"
              description="The employee will get access to tasks, attendance, leave, and salary."
              action={approveKycAction.bind(null, id)}
            />
            <ActionForm action={rejectKycAction.bind(null, id)} className="space-y-2">
              <Field label="Reject reason">
                <Textarea name="reason" required />
              </Field>
              <Button type="submit" variant="destructive">Reject</Button>
            </ActionForm>
            <ActionForm action={requestKycCorrectionAction.bind(null, id)} className="space-y-2">
              <Field label="Request correction" htmlFor="kyc-correction-reason">
                <Textarea id="kyc-correction-reason" name="reason" required />
              </Field>
              <Button type="submit" variant="outline">Send back for correction</Button>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
