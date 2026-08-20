"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveKycAction, submitKycAction, uploadKycDocumentAction } from "@/server/actions/kyc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/status-badge";
import { DOCUMENT_LABELS } from "@/lib/constants";
import { toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type KycPayload = {
  kycStatus: string;
  kycRejectionReason: string | null;
  locked: boolean;
  progress: number;
  missing: string[];
  personal: {
    fullName: string;
    dateOfBirth: string | null;
    gender: string | null;
    phone: string | null;
    email: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pinCode: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
  };
  identity: { panMasked: string | null; govIdType: string | null; govIdMasked: string | null };
  bank: {
    accountHolderName: string;
    bankName: string;
    ifsc: string;
    upiId: string | null;
    accountNumberMasked: string;
  } | null;
  documents: { id: string; title: string; category: string; fileId: string; originalName: string }[];
};

const STEPS = ["Personal", "Identity", "Bank", "Documents", "Review"];

export function KycWizard({ initial, initialStep = 0 }: { initial: KycPayload; initialStep?: number }) {
  const router = useRouter();
  const [step, setStepState] = useState(() => {
    const fallback = Math.min(4, Math.max(0, initialStep));
    if (typeof window === "undefined") return fallback;
    const stored = Number(sessionStorage.getItem("dropzen-kyc-step"));
    return Number.isFinite(stored) ? Math.min(4, Math.max(0, stored)) : fallback;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = initial.locked;

  function setStep(next: number) {
    const n = Math.min(4, Math.max(0, next));
    setStepState(n);
    sessionStorage.setItem("dropzen-kyc-step", String(n));
  }

  async function save(form: FormData) {
    setError(null);
    const result = await saveKycAction(form);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    return true;
  }

  async function saveAndGo(form: FormData, next: number) {
    if (await save(form)) setStep(next);
  }

  if (initial.kycStatus === "PENDING_VERIFICATION") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your verification is under review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            An administrator will review the information you submitted. You will get a notification when it is approved
            or if anything needs to be updated.
          </p>
          <StatusBadge value={initial.kycStatus} />
          <p>Progress recorded: {initial.progress}%</p>
        </CardContent>
      </Card>
    );
  }

  if (initial.kycStatus === "APPROVED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification approved</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Your workspace is fully available.</p>
          <Link href="/dashboard" className={cn(buttonVariants())}>
            Open dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {initial.kycRejectionReason && initial.kycStatus !== "APPROVED" && initial.kycStatus !== "PENDING_VERIFICATION" ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">
              {initial.kycStatus === "REJECTED" ? "Verification rejected" : "Updates requested"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{initial.kycRejectionReason}</CardContent>
        </Card>
      ) : null}

      <div>
        <p className="mb-2 text-sm text-muted-foreground">Completion {initial.progress}%</p>
        <Progress value={initial.progress} />
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              i === step ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {step === 0 ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) => {
            void saveAndGo(fd, 1);
          }}
        >
          <Field label="Full name">
            <Input name="fullName" required defaultValue={initial.personal.fullName} disabled={locked} />
          </Field>
          <Field label="Date of birth">
            <Input name="dateOfBirth" type="date" required defaultValue={toDateInput(initial.personal.dateOfBirth)} disabled={locked} />
          </Field>
          <Field label="Gender">
            <select name="gender" required defaultValue={initial.personal.gender ?? ""} className="h-8 w-full rounded-lg border px-2 text-sm" disabled={locked}>
              <option value="">Select</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="NON_BINARY">Non-binary</option>
              <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
            </select>
          </Field>
          <Field label="Phone">
            <Input name="phone" required defaultValue={initial.personal.phone ?? ""} disabled={locked} />
          </Field>
          <Field label="Email">
            <Input value={initial.personal.email} disabled />
          </Field>
          <Field label="City">
            <Input name="city" required defaultValue={initial.personal.city ?? ""} disabled={locked} />
          </Field>
          <Field label="State">
            <Input name="state" required defaultValue={initial.personal.state ?? ""} disabled={locked} />
          </Field>
          <Field label="PIN code">
            <Input name="pinCode" required defaultValue={initial.personal.pinCode ?? ""} disabled={locked} />
          </Field>
          <Field label="Emergency contact name">
            <Input name="emergencyName" required defaultValue={initial.personal.emergencyName ?? ""} disabled={locked} />
          </Field>
          <Field label="Emergency phone">
            <Input name="emergencyPhone" required defaultValue={initial.personal.emergencyPhone ?? ""} disabled={locked} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Textarea name="address" required defaultValue={initial.personal.address ?? ""} disabled={locked} />
            </Field>
          </div>
          <Button type="submit" disabled={locked}>Save and continue</Button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="space-y-6">
          <form
            className="grid gap-3 sm:grid-cols-2"
            action={(fd) => {
              void saveAndGo(fd, 2);
            }}
          >
            <Field label="PAN" hint={initial.identity.panMasked ? `On file: ${initial.identity.panMasked}` : "Stored encrypted"}>
              <Input name="pan" placeholder="ABCDE1234F" required={!initial.identity.panMasked} disabled={locked} />
            </Field>
            <Field label="Government ID type">
              <select name="govIdType" required defaultValue={initial.identity.govIdType ?? "AADHAAR"} className="h-8 w-full rounded-lg border px-2 text-sm" disabled={locked}>
                <option value="AADHAAR">Aadhaar</option>
                <option value="PASSPORT">Passport</option>
                <option value="DRIVING_LICENSE">Driving licence</option>
                <option value="VOTER_ID">Voter ID</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Government ID number" hint={initial.identity.govIdMasked ? `On file: ${initial.identity.govIdMasked}` : "Masked after save"}>
              <Input name="govIdNumber" required={!initial.identity.govIdMasked} disabled={locked} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={locked}>Save and continue</Button>
            </div>
          </form>
          <UploadSlot locked={locked} category="ID" title="Identity document" />
        </div>
      ) : null}

      {step === 2 ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) => {
            void saveAndGo(fd, 3);
          }}
        >
          <Field label="Account holder name">
            <Input name="accountHolderName" required defaultValue={initial.bank?.accountHolderName} disabled={locked} />
          </Field>
          <Field label="Bank name">
            <Input name="bankName" required defaultValue={initial.bank?.bankName} disabled={locked} />
          </Field>
          <Field label="Account number" hint={initial.bank ? `On file: ${initial.bank.accountNumberMasked}` : "Encrypted at rest"}>
            <Input name="accountNumber" required={!initial.bank} disabled={locked} />
          </Field>
          <Field label="IFSC">
            <Input name="ifsc" required defaultValue={initial.bank?.ifsc} disabled={locked} />
          </Field>
          <Field label="UPI ID">
            <Input name="upiId" defaultValue={initial.bank?.upiId ?? ""} disabled={locked} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={locked}>Save and continue</Button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Upload identity, PAN, and bank proof. Files are private and only visible to you and administrators.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <UploadSlot locked={locked} category="PAN" title="PAN document" />
            <UploadSlot locked={locked} category="BANK_PROOF" title="Bank proof" />
            <UploadSlot locked={locked} category="ADDRESS_PROOF" title="Address proof" />
            <UploadSlot locked={locked} category="OTHER" title="Other document" />
          </div>
          <ul className="space-y-2 text-sm">
            {initial.documents.map((d) => (
              <li key={d.id} className="flex justify-between rounded-lg border p-2">
                <span>{d.title} · {DOCUMENT_LABELS[d.category] ?? d.category}</span>
                <a className="text-primary underline" href={`/api/files/${d.fileId}`}>Download</a>
              </li>
            ))}
          </ul>
          <Button type="button" onClick={() => setStep(4)} disabled={locked && initial.documents.length === 0}>
            Continue to review
          </Button>
        </div>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Review and submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><strong>Name:</strong> {initial.personal.fullName}</p>
            <p><strong>Phone:</strong> {initial.personal.phone}</p>
            <p><strong>Address:</strong> {initial.personal.address}, {initial.personal.city}, {initial.personal.state} {initial.personal.pinCode}</p>
            <p><strong>PAN:</strong> {initial.identity.panMasked ?? "—"}</p>
            <p><strong>ID:</strong> {initial.identity.govIdType} {initial.identity.govIdMasked}</p>
            <p><strong>Bank:</strong> {initial.bank ? `${initial.bank.bankName} · ${initial.bank.accountNumberMasked}` : "—"}</p>
            <p><strong>Documents:</strong> {initial.documents.length}</p>
            {initial.missing.length ? (
              <p className="text-destructive">Still missing: {initial.missing.filter((m) => m !== "Accuracy declaration").join(", ")}</p>
            ) : null}
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const result = await submitKycAction();
                  if (!result.ok) setError(result.error);
                  else {
                    sessionStorage.removeItem("dropzen-kyc-step");
                    router.refresh();
                  }
                });
              }}
            >
              <label className="flex items-start gap-2">
                <input type="checkbox" name="declared" required className="mt-1" disabled={locked} />
                I confirm that the information provided is accurate.
              </label>
              <Button type="submit" disabled={locked}>
                {pending ? "Submitting…" : "Submit for verification"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function UploadSlot({ locked, category, title }: { locked: boolean; category: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 rounded-lg border p-3"
      action={(fd) =>
        start(async () => {
          fd.set("category", category);
          fd.set("title", title);
          const result = await uploadKycDocumentAction(fd);
          if (!result.ok) setError(result.error);
          else {
            setError(null);
            router.refresh();
          }
        })
      }
    >
      <p className="text-sm font-medium">{title}</p>
      <Input type="file" name="file" required disabled={locked} accept=".pdf,.jpg,.jpeg,.png" />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending || locked}>Upload</Button>
    </form>
  );
}
