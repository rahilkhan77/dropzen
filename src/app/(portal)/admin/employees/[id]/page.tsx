import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatDateTime } from "@/lib/dates";
import { formatInr, parseJson } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminResetPasswordAction,
  resendInvitationAction,
  setEmployeeStatusAction,
  updateEmployeeAdminAction,
} from "@/server/actions/employees";
import { verifyBankDetailsAction } from "@/server/actions/payroll";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type EmployeeDetail = {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  department: string | null;
  designation: string | null;
  joiningDate: string;
  skills: string;
  kycStatus: string;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  kycRejectionReason: string | null;
  kycReviewedBy: { email: string } | null;
  user: { email: string; status: string; lastLoginAt: string | null };
  invitation: { status: string; expiresAt: string; usedAt: string | null; sentAt: string } | null;
  bankDetails: {
    status: string;
    bankName: string;
    ifsc: string;
    accountLast4: string;
    panLast4: string | null;
    accountHolderName: string;
    upiId: string | null;
    accountNumberMasked?: string;
  } | null;
  attendance: { id: string; dateKey: string; status: string }[];
  assignments: { id: string; status: string; task: { id: string; title: string } }[];
  salaryRecords: { id: string; month: number; year: number; amount: number; status: string }[];
  documents: { id: string; title: string; category: string; fileId: string }[];
  leaveRequests: { id: string; startDate: string; endDate: string; status: string; leaveType: { name: string } }[];
  logs: { id: string; action: string; createdAt: string; entityType: string }[];
};

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const employee = await apiGet<EmployeeDetail>(`/api/admin/employees/${id}`);
  if (!employee) notFound();
  const logs = employee.logs ?? [];
  const account = employee.user.status;

  return (
    <div>
      <PageHeader
        title={employee.fullName}
        description={`${employee.employeeCode} · ${employee.department} · ${employee.designation}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge value={account} />
            <Link href={`/admin/verification/${employee.id}`}>
              <StatusBadge value={employee.kycStatus} />
            </Link>
            {account === "ACTIVE" ? (
              <ConfirmButton
                label="Suspend"
                title="Suspend employee"
                description="They will be signed out and cannot use the portal until reactivated."
                action={setEmployeeStatusAction.bind(null, employee.id, "SUSPENDED")}
              />
            ) : (
              <ConfirmButton
                label="Reactivate"
                title="Reactivate employee"
                description="Restore access if the account was suspended or disabled."
                action={setEmployeeStatusAction.bind(null, employee.id, "ACTIVE")}
              />
            )}
            {account !== "DISABLED" ? (
              <ConfirmButton
                label="Disable"
                title="Disable employee"
                description="Soft-disable keeps payroll and audit history. The employee cannot sign in."
                variant="destructive"
                action={setEmployeeStatusAction.bind(null, employee.id, "DISABLED")}
              />
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Basic information</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Name: {employee.fullName}</p>
            <p>Employee ID: {employee.employeeCode}</p>
            <p>Email: {employee.user.email}</p>
            <p>Phone: {employee.phone ?? "—"}</p>
            <p>Department: {employee.department ?? "—"}</p>
            <p>Designation: {employee.designation ?? "—"}</p>
            <p>Joining date: {String(employee.joiningDate).slice(0, 10)}</p>
            <p>Status: <StatusBadge value={account} /></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Verification</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Status: <StatusBadge value={employee.kycStatus} /></p>
            <p>Submitted: {employee.kycSubmittedAt ? formatDateTime(employee.kycSubmittedAt) : "—"}</p>
            <p>Reviewed: {employee.kycReviewedAt ? formatDateTime(employee.kycReviewedAt) : "—"}</p>
            <p>Reviewer: {employee.kycReviewedBy?.email ?? "—"}</p>
            <p>Reason: {employee.kycRejectionReason ?? "—"}</p>
            <Link className="text-primary" href={`/admin/verification/${employee.id}`}>Open review</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Account: <StatusBadge value={account} /></p>
            <p>Last login: {employee.user.lastLoginAt ? formatDateTime(employee.user.lastLoginAt) : "Never"}</p>
            <p>Invitation: {employee.invitation ? `${employee.invitation.status}${employee.invitation.sentAt ? ` · sent ${formatDateTime(employee.invitation.sentAt)}` : ""}` : "—"}</p>
            {account === "INVITED" || employee.invitation?.status === "PENDING" || employee.invitation?.status === "EXPIRED" ? (
              <ConfirmButton
                label="Resend invitation"
                title="Resend invitation"
                description="Invalidates the previous unused invitation and emails a new link."
                action={resendInvitationAction.bind(null, employee.id)}
              />
            ) : (
              <ConfirmButton
                label="Send password reset"
                title="Send password reset"
                description="Emails a one-time reset link. The current password is never displayed."
                action={adminResetPasswordAction.bind(null, employee.id)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ActionForm action={updateEmployeeAdminAction.bind(null, employee.id)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name"><Input name="fullName" defaultValue={employee.fullName} /></Field>
                <Field label="Email"><Input name="email" defaultValue={employee.user.email} /></Field>
                <Field label="Phone"><Input name="phone" defaultValue={employee.phone ?? ""} /></Field>
                <Field label="Department"><Input name="department" defaultValue={employee.department ?? ""} /></Field>
                <Field label="Designation"><Input name="designation" defaultValue={employee.designation ?? ""} /></Field>
                <Field label="Joining date"><Input type="date" name="joiningDate" defaultValue={String(employee.joiningDate).slice(0, 10)} /></Field>
                <Field label="Skills"><Input name="skills" defaultValue={parseJson<string[]>(employee.skills, []).join(", ")} /></Field>
                <Button type="submit">Save</Button>
              </ActionForm>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="operations" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/admin/tasks", label: "Tasks", value: String(employee.assignments.length) },
            { href: "/admin/attendance", label: "Attendance", value: String(employee.attendance.length) },
            { href: "/admin/leave", label: "Leave", value: String(employee.leaveRequests.length) },
            { href: "/admin/payroll", label: "Salary", value: String(employee.salaryRecords.length) },
            { href: "/admin/documents", label: "Documents", value: String(employee.documents.length) },
            { href: `/admin/verification/${employee.id}`, label: "Bank verification", value: employee.bankDetails?.status ?? "Not submitted" },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="rounded-lg border p-4 hover:bg-muted/40">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-lg font-medium">{item.value}</p>
            </Link>
          ))}
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {employee.attendance.length === 0 ? (
                <TableRow><TableCell colSpan={2}>No attendance records yet.</TableCell></TableRow>
              ) : employee.attendance.map((a) => (
                <TableRow key={a.id}><TableCell>{a.dateKey}</TableCell><TableCell><StatusBadge value={a.status} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="tasks" className="mt-4 space-y-2">
          {employee.assignments.length === 0 ? <p className="text-sm text-muted-foreground">No tasks assigned yet.</p> : employee.assignments.map((a) => (
            <Link key={a.id} href={`/admin/tasks/${a.task.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>{a.task.title}</span>
              <StatusBadge value={a.status} />
            </Link>
          ))}
        </TabsContent>
        <TabsContent value="salary" className="mt-4">
          {employee.salaryRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No salary records available yet.</p>
          ) : employee.salaryRecords.map((s) => (
            <p key={s.id} className="flex justify-between border-b py-2 text-sm">
              <span>{s.month}/{s.year} · {formatInr(s.amount)}</span>
              <StatusBadge value={s.status} />
            </p>
          ))}
        </TabsContent>
        <TabsContent value="bank" className="mt-4">
          {employee.bankDetails ? (
            <Card>
              <CardHeader><CardTitle>Payroll details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>Holder: {employee.bankDetails.accountHolderName}</p>
                <p>Bank: {employee.bankDetails.bankName}</p>
                <p>Account: {employee.bankDetails.accountNumberMasked ?? `•••• ${employee.bankDetails.accountLast4}`}</p>
                <p>IFSC: {employee.bankDetails.ifsc}</p>
                <p>UPI: {employee.bankDetails.upiId ?? "—"}</p>
                <p>PAN: {employee.bankDetails.panLast4 ? `XXXXX${employee.bankDetails.panLast4}` : "—"}</p>
                <StatusBadge value={employee.bankDetails.status} />
                {employee.bankDetails.status !== "VERIFIED" ? (
                  <div className="flex gap-2 pt-2">
                    <ConfirmButton label="Verify" title="Verify bank details" description="Mark these details as verified for payroll." action={verifyBankDetailsAction.bind(null, employee.id, "VERIFIED")} />
                    <ConfirmButton label="Reject" title="Reject bank details" description="Employee will be asked to resubmit." variant="destructive" action={verifyBankDetailsAction.bind(null, employee.id, "REJECTED", "Please recheck account number / IFSC")} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Not submitted yet.</p>
          )}
        </TabsContent>
        <TabsContent value="documents" className="mt-4 space-y-2">
          {employee.documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : employee.documents.map((d) => (
            <a key={d.id} href={`/api/files/${d.fileId}`} className="block rounded-lg border p-3 text-sm hover:bg-muted/40">
              {d.title}
            </a>
          ))}
        </TabsContent>
        <TabsContent value="activity" className="mt-4 space-y-2 text-sm">
          {logs.map((l) => (
            <p key={l.id} className="rounded-lg border p-2">
              {formatDateTime(l.createdAt)} · {l.action}
            </p>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
