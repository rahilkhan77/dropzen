import { Badge } from "@/components/ui/badge";
import {
  ASSIGNMENT_LABELS,
  ATTENDANCE_LABELS,
  BANK_LABELS,
  LEAVE_LABELS,
  PRIORITY_LABELS,
  SALARY_LABELS,
  KYC_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  PRESENT: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LATE: "bg-amber-50 text-amber-800 ring-amber-200",
  HALF_DAY: "bg-sky-50 text-sky-800 ring-sky-200",
  LEAVE: "bg-violet-50 text-violet-800 ring-violet-200",
  ABSENT: "bg-rose-50 text-rose-800 ring-rose-200",
  ASSIGNED: "bg-slate-100 text-slate-800 ring-slate-200",
  IN_PROGRESS: "bg-sky-50 text-sky-800 ring-sky-200",
  SUBMITTED: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  UNDER_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REVISION_REQUIRED: "bg-orange-50 text-orange-800 ring-orange-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  OVERDUE: "bg-rose-50 text-rose-800 ring-rose-200",
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PROCESSING: "bg-sky-50 text-sky-800 ring-sky-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  PAID: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FAILED: "bg-rose-50 text-rose-800 ring-rose-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOW: "bg-slate-100 text-slate-700 ring-slate-200",
  MEDIUM: "bg-sky-50 text-sky-800 ring-sky-200",
  HIGH: "bg-amber-50 text-amber-800 ring-amber-200",
  URGENT: "bg-rose-50 text-rose-800 ring-rose-200",
  NORMAL: "bg-slate-100 text-slate-700 ring-slate-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  INVITED: "bg-sky-50 text-sky-800 ring-sky-200",
  SUSPENDED: "bg-amber-50 text-amber-800 ring-amber-200",
  DISABLED: "bg-slate-100 text-slate-700 ring-slate-200",
  NOT_STARTED: "bg-slate-100 text-slate-800 ring-slate-200",
  INCOMPLETE: "bg-amber-50 text-amber-800 ring-amber-200",
  PENDING_VERIFICATION: "bg-sky-50 text-sky-800 ring-sky-200",
};

const labels: Record<string, string> = {
  ...ASSIGNMENT_LABELS,
  ...ATTENDANCE_LABELS,
  ...LEAVE_LABELS,
  ...SALARY_LABELS,
  ...BANK_LABELS,
  ...PRIORITY_LABELS,
  ...KYC_LABELS,
  ACTIVE: "Active",
  INVITED: "Invited",
  SUSPENDED: "Suspended",
  DISABLED: "Disabled",
  NORMAL: "Normal",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-0 ring-1 capitalize", tone[value] ?? "bg-muted", className)}
    >
      {labels[value] ?? value.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
