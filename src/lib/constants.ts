export const APP_NAME = "DropZen";
export const SESSION_COOKIE = "dropzen_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_EXCEL_BYTES = 12 * 1024 * 1024;

export const EXCEL_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
]);

export const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const DOCUMENT_MIME = new Set([
  ...EXCEL_MIME,
  ...IMAGE_MIME,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ASSIGNMENT_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REVISION_REQUIRED: "Revision Required",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half Day",
  LEAVE: "Leave",
  ABSENT: "Absent",
};

export const LEAVE_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const SALARY_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
};

export const BANK_LABELS: Record<string, string> = {
  PENDING: "Pending verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const DOCUMENT_LABELS: Record<string, string> = {
  ID: "ID document",
  PAN: "PAN",
  BANK_PROOF: "Bank proof",
  ADDRESS_PROOF: "Address proof",
  EMPLOYMENT: "Employment document",
  CONTRACT: "Contract",
  PAYSLIP: "Payslip",
  OTHER: "Other",
};

export const KYC_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  INCOMPLETE: "Incomplete",
  PENDING_VERIFICATION: "Under review",
  APPROVED: "Approved",
  REJECTED: "Needs updates",
};

export const EMPLOYEE_UPLOAD_CATEGORIES = ["ID", "PAN", "BANK_PROOF", "ADDRESS_PROOF", "OTHER"] as const;

export const TERMINAL_TASK_STATUSES = ["APPROVED", "COMPLETED"] as const;
export const OPEN_TASK_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "REVISION_REQUIRED",
  "OVERDUE",
] as const;
