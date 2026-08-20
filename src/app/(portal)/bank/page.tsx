import { requireApprovedEmployee } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertBankDetailsAction } from "@/server/actions/payroll";

export default async function BankPage() {
  const user = await requireApprovedEmployee();
  const details = await apiGet<{
    accountHolderName: string;
    bankName: string;
    ifsc: string;
    upiId: string | null;
    accountNumberMasked: string;
    panMasked: string;
    status: string;
    rejectionReason: string | null;
    otherInfo: string | null;
  } | null>("/api/employee/bank");

  return (
    <div>
      <PageHeader
        title="Bank details"
        description="Payroll information is encrypted at rest and never shown to other employees."
        actions={details ? <StatusBadge value={details.status} /> : undefined}
      />
      {details ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>On file</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Account holder: {details.accountHolderName}</p>
            <p>Bank: {details.bankName}</p>
            <p>Account: {details.accountNumberMasked}</p>
            <p>IFSC: {details.ifsc}</p>
            <p>UPI: {details.upiId ?? "—"}</p>
            <p>PAN: {details.panMasked}</p>
            {details.rejectionReason ? <p className="text-destructive sm:col-span-2">{details.rejectionReason}</p> : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{details ? "Update details" : "Submit payroll details"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={upsertBankDetailsAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Account holder name">
              <Input name="accountHolderName" required defaultValue={details?.accountHolderName} />
            </Field>
            <Field label="Bank name">
              <Input name="bankName" required defaultValue={details?.bankName} />
            </Field>
            <Field label="Account number" hint="Stored encrypted. Shown masked after save.">
              <Input name="accountNumber" required />
            </Field>
            <Field label="IFSC">
              <Input name="ifsc" required defaultValue={details?.ifsc} />
            </Field>
            <Field label="UPI ID">
              <Input name="upiId" defaultValue={details?.upiId ?? ""} />
            </Field>
            <Field label="PAN">
              <Input name="pan" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Other payroll notes">
                <Textarea name="otherInfo" defaultValue={details?.otherInfo ?? ""} />
              </Field>
            </div>
            <Button type="submit">Save for verification</Button>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
