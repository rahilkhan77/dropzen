import { Router, type Request } from "express";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth, requireAdmin, requireEmployee, requireApprovedEmployee, assertApprovedEmployee } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { ok, created } from "../utils/response.js";
import { field, list, bool, param } from "../utils/form.js";
import { errors } from "../utils/errors.js";
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  profileSchema,
} from "../validators/index.js";
import * as employees from "../services/employees.js";
import * as dashboard from "../services/dashboard.js";
import * as attendance from "../services/attendance.js";
import * as tasks from "../services/tasks.js";
import * as leave from "../services/leave.js";
import * as payroll from "../services/payroll.js";
import * as documents from "../services/documents.js";
import * as announcements from "../services/announcements.js";
import * as notifications from "../services/notifications.js";
import * as reports from "../services/reports.js";
import * as admin from "../services/admin.js";
import * as settings from "../services/settings.js";
import * as kyc from "../services/kyc.js";
import { subscribe } from "../services/realtime.js";
import { prisma } from "../config/db.js";
import { parsePage } from "../utils/pagination.js";
import { storeBuffer, readStoredFile } from "../services/storage.js";
import type { AttendanceStatus, CorrectionStatus, DocumentCategory, UserStatus } from "@prisma/client";

export const apiRouter = Router();

apiRouter.get("/health", asyncHandler(async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "unhealthy", database: "disconnected" });
  }
}));
apiRouter.get("/branding", asyncHandler(async (_req, res) => ok(res, await settings.publicBranding())));
apiRouter.get("/branding/logo", asyncHandler(async (_req, res) => {
  const s = await settings.getSettings();
  if (!s.logoFileId) throw errors.notFound("Logo not set");
  const file = await prisma.fileAsset.findUnique({ where: { id: s.logoFileId } });
  if (!file) throw errors.notFound("Logo not set");
  const buffer = await readStoredFile(file.storageKey);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.send(buffer);
}));

/* ---------- dashboards ---------- */
apiRouter.get(
  "/employee/dashboard",
  ...requireApprovedEmployee,
  asyncHandler(async (req, res) => {
    return ok(res, await dashboard.employeeDashboard(req.auth!.userId, req.auth!.employeeId!));
  }),
);
apiRouter.get(
  "/admin/dashboard",
  ...requireAdmin,
  asyncHandler(async (req, res) => ok(res, await dashboard.adminDashboard())),
);
apiRouter.get(
  "/settings",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const s = await settings.getSettings();
    return ok(res, {
      companyName: s.companyName,
      legalName: s.legalName,
      timezone: s.timezone,
      workingDays: s.workingDays,
      workStart: s.workStart,
      workEnd: s.workEnd,
      lateAfter: s.lateAfter,
      halfDayAfter: s.halfDayAfter,
      currency: s.currency,
    });
  }),
);

/* ---------- employees ---------- */
apiRouter.get(
  "/admin/employees",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const { page, limit } = parsePage(req);
    return ok(res, await employees.listEmployees(q, page, limit));
  }),
);
apiRouter.get(
  "/admin/employees/options",
  ...requireAdmin,
  asyncHandler(async (_req, res) => ok(res, { items: await employees.listEmployeeOptions() })),
);
apiRouter.get(
  "/admin/employees/:id",
  ...requireAdmin,
  asyncHandler(async (req, res) => ok(res, await employees.getEmployee(param(req, "id")))),
);
apiRouter.post(
  "/admin/employees",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = employeeCreateSchema.parse({
      fullName: field(req, "fullName"),
      email: field(req, "email"),
      username: field(req, "username") || undefined,
      phone: field(req, "phone"),
      department: field(req, "department"),
      designation: field(req, "designation"),
      joiningDate: field(req, "joiningDate"),
      employeeCode: field(req, "employeeCode") || undefined,
      dateOfBirth: field(req, "dateOfBirth") || undefined,
      address: field(req, "address") || undefined,
      emergencyName: field(req, "emergencyName") || undefined,
      emergencyPhone: field(req, "emergencyPhone") || undefined,
      baseSalary: field(req, "baseSalary") || undefined,
    });
    return created(res, await employees.createEmployee(req, parsed), "Employee created");
  }),
);
apiRouter.patch(
  "/admin/employees/:id",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = employeeUpdateSchema.parse({
      fullName: field(req, "fullName") || undefined,
      email: field(req, "email") || undefined,
      phone: field(req, "phone"),
      department: field(req, "department") || undefined,
      designation: field(req, "designation") || undefined,
      joiningDate: field(req, "joiningDate") || undefined,
      skills: field(req, "skills") || undefined,
      dateOfBirth: field(req, "dateOfBirth") || undefined,
      address: field(req, "address") || undefined,
      emergencyName: field(req, "emergencyName") || undefined,
      emergencyPhone: field(req, "emergencyPhone") || undefined,
      baseSalary: field(req, "baseSalary") || undefined,
    });
    await employees.updateEmployee(req, param(req, "id"), parsed);
    return ok(res, undefined, "Employee updated");
  }),
);
apiRouter.delete(
  "/admin/employees/:id",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    await employees.deleteEmployee(req, param(req, "id"));
    return ok(res, { redirectTo: "/admin/employees" }, "Employee disabled. Records were kept.");
  }),
);
apiRouter.patch(
  "/admin/employees/:id/status",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    const status = (field(req, "status") || req.body.status) as UserStatus;
    if (!["ACTIVE", "SUSPENDED", "DISABLED"].includes(status)) throw errors.validation("Invalid status");
    const result = await employees.setEmployeeStatus(req, param(req, "id"), status);
    return ok(res, result, `Employee ${result.status.toLowerCase()}`);
  }),
);
apiRouter.post(
  "/admin/employees/:id/resend-invitation",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    return ok(res, await employees.resendInvitation(req, param(req, "id")), "Invitation sent");
  }),
);
apiRouter.post(
  "/admin/employees/:id/reset-password",
  ...requireAdmin,
  asyncHandler(async (req, res) => {
    return ok(res, await employees.adminResetPassword(req, param(req, "id")), "Password reset email sent");
  }),
);

apiRouter.get(
  "/employee/profile",
  ...requireEmployee,
  asyncHandler(async (req, res) => ok(res, await employees.getOwnProfile(req.auth!.employeeId!))),
);
apiRouter.patch(
  "/employee/profile",
  ...requireEmployee,
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    const parsed = profileSchema.parse({
      fullName: field(req, "fullName"),
      phone: field(req, "phone") || undefined,
      dateOfBirth: field(req, "dateOfBirth") || undefined,
      address: field(req, "address") || undefined,
      emergencyName: field(req, "emergencyName") || undefined,
      emergencyPhone: field(req, "emergencyPhone") || undefined,
      skills: field(req, "skills") || undefined,
    });
    await employees.updateOwnProfile(req, parsed, req.file);
    return ok(res, undefined, "Profile saved");
  }),
);

/* ---------- employee verification ---------- */
apiRouter.get("/employee/kyc", ...requireEmployee, asyncHandler(async (req, res) => {
  return ok(res, await kyc.getOwnKyc(req.auth!.employeeId!));
}));
apiRouter.patch("/employee/kyc", ...requireEmployee, asyncHandler(async (req, res) => {
  return ok(res, await kyc.saveDraft(req, {
    fullName: field(req, "fullName") || undefined,
    dateOfBirth: field(req, "dateOfBirth") || undefined,
    gender: field(req, "gender") || undefined,
    phone: field(req, "phone") || undefined,
    address: field(req, "address") || undefined,
    city: field(req, "city") || undefined,
    state: field(req, "state") || undefined,
    pinCode: field(req, "pinCode") || undefined,
    emergencyName: field(req, "emergencyName") || undefined,
    emergencyPhone: field(req, "emergencyPhone") || undefined,
    pan: field(req, "pan") || undefined,
    govIdType: field(req, "govIdType") || undefined,
    govIdNumber: field(req, "govIdNumber") || undefined,
    accountHolderName: field(req, "accountHolderName") || undefined,
    bankName: field(req, "bankName") || undefined,
    accountNumber: field(req, "accountNumber") || undefined,
    ifsc: field(req, "ifsc") || undefined,
    upiId: field(req, "upiId") || undefined,
  }), "Progress saved");
}));
apiRouter.post("/employee/kyc/submit", ...requireEmployee, asyncHandler(async (req, res) => {
  return ok(res, await kyc.submitKyc(req), "Submitted for verification");
}));
apiRouter.post("/employee/kyc/documents", ...requireEmployee, upload.single("file"), asyncHandler(async (req, res) => {
  return ok(res, await kyc.uploadKycDocument(req, {
    category: field(req, "category") as import("@prisma/client").DocumentCategory,
    title: field(req, "title") || field(req, "category"),
  }, req.file), "Document uploaded");
}));
apiRouter.get("/admin/kyc", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req);
  return ok(res, await kyc.listAdminKyc({
    q: typeof req.query.q === "string" ? req.query.q : "",
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    page,
    limit,
  }));
}));
apiRouter.get("/admin/kyc/:employeeId", ...requireAdmin, asyncHandler(async (req, res) => {
  return ok(res, await kyc.getAdminKyc(param(req, "employeeId"), req.query.reveal === "1"));
}));
apiRouter.post("/admin/kyc/:employeeId/approve", ...requireAdmin, asyncHandler(async (req, res) => {
  return ok(res, await kyc.reviewKyc(req, param(req, "employeeId"), "APPROVED"), "Verification approved");
}));
apiRouter.post("/admin/kyc/:employeeId/reject", ...requireAdmin, asyncHandler(async (req, res) => {
  return ok(res, await kyc.reviewKyc(req, param(req, "employeeId"), "REJECTED", field(req, "reason")), "Verification rejected");
}));
apiRouter.post("/admin/kyc/:employeeId/correction", ...requireAdmin, asyncHandler(async (req, res) => {
  return ok(res, await kyc.reviewKyc(req, param(req, "employeeId"), "REQUEST_CORRECTION", field(req, "reason")), "Correction requested");
}));

apiRouter.get("/employee/events", ...requireEmployee, asyncHandler(async (req, res) => {
  await new Promise<void>((resolve) => {
    subscribe(req.auth!.userId, res);
    const done = () => resolve();
    res.on("close", done);
    req.on("close", done);
  });
}));
apiRouter.get("/employee/salary", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  return ok(res, await payroll.employeePayroll(req.auth!.employeeId!));
}));

/* ---------- attendance ---------- */
apiRouter.post("/attendance/check-in", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  const row = await attendance.checkIn(req);
  return ok(res, row, `Checked in as ${row.status.replace("_", " ").toLowerCase()}`);
}));
apiRouter.post("/attendance/check-out", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  return ok(res, await attendance.checkOut(req), "Checked out");
}));
apiRouter.get("/attendance/today", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await attendance.todayAttendance(req))));
apiRouter.get("/attendance/history", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await attendance.history(req))));
apiRouter.post("/attendance/correction-request", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  await attendance.requestCorrection(req, {
    dateKey: field(req, "dateKey"),
    reason: field(req, "reason"),
    proposedStatus: (field(req, "proposedStatus") as AttendanceStatus) || "PRESENT",
    proposedCheckIn: field(req, "proposedCheckIn") || undefined,
    proposedCheckOut: field(req, "proposedCheckOut") || undefined,
  });
  return ok(res, undefined, "Correction request submitted");
}));
apiRouter.get("/admin/attendance", ...requireAdmin, asyncHandler(async (req, res) => {
  return ok(res, await attendance.adminList({
    dateKey: typeof req.query.dateKey === "string" ? req.query.dateKey : undefined,
    range: typeof req.query.range === "string" ? req.query.range : undefined,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
    department: typeof req.query.department === "string" ? req.query.department : undefined,
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 25),
  }));
}));
apiRouter.get("/admin/attendance/export", ...requireAdmin, asyncHandler(async (req, res) => {
  const csv = await attendance.exportCsv({
    dateKey: typeof req.query.dateKey === "string" ? req.query.dateKey : undefined,
    range: typeof req.query.range === "string" ? req.query.range : undefined,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
    department: typeof req.query.department === "string" ? req.query.department : undefined,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="attendance.csv"');
  return res.send(csv);
}));
apiRouter.patch("/admin/attendance/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.attendance.findUnique({ where: { id: param(req, "id") } });
  if (!existing) throw errors.notFound("Attendance not found");
  return ok(res, await attendance.adminUpsert(req, {
    id: param(req, "id"),
    employeeId: existing.employeeId,
    dateKey: existing.dateKey,
    status: (field(req, "status") as AttendanceStatus) || existing.status,
    notes: field(req, "notes"),
    checkInAt: field(req, "checkInAt") || undefined,
    checkOutAt: field(req, "checkOutAt") || undefined,
  }), "Attendance saved");
}));
apiRouter.post("/admin/attendance", ...requireAdmin, asyncHandler(async (req, res) => {
  await attendance.adminUpsert(req, {
    employeeId: field(req, "employeeId"),
    dateKey: field(req, "dateKey"),
    status: field(req, "status") as AttendanceStatus,
    notes: field(req, "notes"),
    checkInAt: field(req, "checkInAt") || undefined,
    checkOutAt: field(req, "checkOutAt") || undefined,
  });
  return ok(res, undefined, "Attendance saved");
}));
apiRouter.post("/admin/attendance/corrections/:id/review", ...requireAdmin, asyncHandler(async (req, res) => {
  const status = field(req, "status") as CorrectionStatus;
  await attendance.reviewCorrection(req, param(req, "id"), status, field(req, "note") || undefined);
  return ok(res, undefined, `Correction ${status.toLowerCase()}`);
}));

/* ---------- tasks ---------- */
const taskUpload = upload.fields([
  { name: "template", maxCount: 1 },
  { name: "references", maxCount: 8 },
  { name: "file", maxCount: 1 },
]);

function taskFiles(req: Request) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    template: files?.template?.[0],
    references: files?.references,
  };
}

apiRouter.post("/admin/tasks", ...requireAdmin, taskUpload, asyncHandler(async (req, res) => {
  const { taskSchema } = await import("../validators/index.js");
  const parsed = taskSchema.parse({
    title: field(req, "title"),
    instructions: field(req, "instructions"),
    description: field(req, "description") || undefined,
    dateKey: field(req, "dateKey"),
    deadline: field(req, "deadline"),
    priority: field(req, "priority") || "MEDIUM",
    estimatedHours: field(req, "estimatedHours") || undefined,
    notes: field(req, "notes") || undefined,
    employeeIds: list(req, "employeeIds"),
    recurring: bool(req, "recurring"),
    frequency: field(req, "frequency") || undefined,
  });
  const task = await tasks.createTask(req, parsed, taskFiles(req));
  return created(res, { id: task.id }, "Task created");
}));
apiRouter.get("/admin/tasks", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req);
  return ok(res, await tasks.listAdminTasks({
    q: typeof req.query.q === "string" ? req.query.q : "",
    employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
    page,
    limit,
  }));
}));
apiRouter.get("/admin/tasks/:id", ...requireAdmin, asyncHandler(async (req, res) => ok(res, await tasks.getTask(param(req, "id")))));
apiRouter.patch("/admin/tasks/:id", ...requireAdmin, taskUpload, asyncHandler(async (req, res) => {
  await tasks.updateTask(req, param(req, "id"), {
    title: field(req, "title") || undefined,
    instructions: field(req, "instructions") || undefined,
    dateKey: field(req, "dateKey") || undefined,
    deadline: field(req, "deadline") || undefined,
    priority: (field(req, "priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || undefined,
    estimatedHours: field(req, "estimatedHours") || undefined,
    notes: field(req, "notes") || undefined,
    employeeIds: list(req, "employeeIds"),
  }, taskFiles(req));
  return ok(res, undefined, "Task updated");
}));
apiRouter.delete("/admin/tasks/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  await tasks.deleteTask(req, param(req, "id"));
  return ok(res, undefined, "Task deleted");
}));
apiRouter.post("/admin/tasks/:id/assign", ...requireAdmin, asyncHandler(async (req, res) => {
  await tasks.assignTask(req, param(req, "id"), list(req, "employeeIds"));
  return ok(res, undefined, "Assignees updated");
}));
apiRouter.post("/admin/tasks/:id/duplicate", ...requireAdmin, asyncHandler(async (req, res) => {
  const copy = await tasks.duplicateTask(req, param(req, "id"));
  return ok(res, { id: copy.id }, "Task duplicated");
}));

apiRouter.get("/employee/tasks", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await tasks.employeeTasks(req.auth!.employeeId!))));
apiRouter.get("/employee/tasks/:id", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await tasks.employeeTask(req.auth!.employeeId!, param(req, "id")))));
apiRouter.post("/employee/assignments/:id/start", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  await tasks.startTask(req, param(req, "id"));
  return ok(res);
}));
apiRouter.post("/employee/assignments/:id/submit", ...requireApprovedEmployee, upload.single("file"), asyncHandler(async (req, res) => {
  await tasks.submitWork(req, param(req, "id"), req.file, field(req, "comments"));
  return ok(res, undefined, "Work submitted for review");
}));

apiRouter.get("/admin/submissions", ...requireAdmin, asyncHandler(async (_req, res) => ok(res, await tasks.listSubmissions())));
apiRouter.get("/admin/submissions/:id", ...requireAdmin, asyncHandler(async (req, res) => ok(res, await tasks.getSubmission(param(req, "id")))));
apiRouter.post("/admin/submissions/:id/approve", ...requireAdmin, asyncHandler(async (req, res) => {
  await tasks.reviewSubmission(req, param(req, "id"), "APPROVED", field(req, "feedback") || undefined);
  return ok(res, undefined, "Approved");
}));
apiRouter.post("/admin/submissions/:id/revision", ...requireAdmin, asyncHandler(async (req, res) => {
  await tasks.reviewSubmission(req, param(req, "id"), "REVISION_REQUIRED", field(req, "feedback") || "Please revise and resubmit.");
  return ok(res, undefined, "Revision requested");
}));
apiRouter.post("/admin/assignments/:id/review", ...requireAdmin, asyncHandler(async (req, res) => {
  const decision = field(req, "decision") as "APPROVED" | "REVISION_REQUIRED" | "UNDER_REVIEW";
  await tasks.reviewSubmission(req, param(req, "id"), decision, field(req, "feedback") || undefined);
  return ok(res, undefined, decision === "APPROVED" ? "Approved" : "Revision requested");
}));

/* ---------- leave ---------- */
apiRouter.post("/leave", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  const { leaveSchema } = await import("../validators/index.js");
  const parsed = leaveSchema.parse({
    leaveTypeId: field(req, "leaveTypeId"),
    startDate: field(req, "startDate"),
    endDate: field(req, "endDate"),
    reason: field(req, "reason"),
  });
  await leave.applyLeave(req, parsed);
  return ok(res, undefined, "Leave request submitted");
}));
apiRouter.get("/leave", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await leave.myLeave(req.auth!.employeeId!))));
apiRouter.get("/leave/balance", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  const data = await leave.myLeave(req.auth!.employeeId!);
  return ok(res, data.balances);
}));
apiRouter.get("/admin/leave", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req);
  return ok(res, await leave.adminLeave({
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
    leaveTypeId: typeof req.query.leaveTypeId === "string" ? req.query.leaveTypeId : undefined,
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    page,
    limit,
  }));
}));
apiRouter.post("/admin/leave/:id/approve", ...requireAdmin, asyncHandler(async (req, res) => {
  await leave.reviewLeave(req, param(req, "id"), "APPROVED", field(req, "adminNote") || undefined);
  return ok(res, undefined, "Leave approved");
}));
apiRouter.post("/admin/leave/:id/reject", ...requireAdmin, asyncHandler(async (req, res) => {
  await leave.reviewLeave(req, param(req, "id"), "REJECTED", field(req, "adminNote") || undefined);
  return ok(res, undefined, "Leave rejected");
}));
apiRouter.post("/admin/leave", ...requireAdmin, asyncHandler(async (req, res) => {
  await leave.adminAddLeave(req, {
    employeeId: field(req, "employeeId"),
    leaveTypeId: field(req, "leaveTypeId"),
    startDate: field(req, "startDate"),
    endDate: field(req, "endDate"),
    reason: field(req, "reason") || undefined,
  });
  return ok(res, undefined, "Leave added");
}));

/* ---------- bank / payroll ---------- */
apiRouter.get("/employee/bank", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await payroll.getOwnBank(req.auth!.employeeId!))));
apiRouter.put("/employee/bank", ...requireApprovedEmployee, asyncHandler(async (req, res) => {
  const { bankSchema } = await import("../validators/index.js");
  const parsed = bankSchema.parse({
    accountHolderName: field(req, "accountHolderName"),
    bankName: field(req, "bankName"),
    accountNumber: field(req, "accountNumber"),
    ifsc: field(req, "ifsc").toUpperCase(),
    upiId: field(req, "upiId") || undefined,
    pan: field(req, "pan").toUpperCase() || undefined,
    otherInfo: field(req, "otherInfo") || undefined,
  });
  await payroll.upsertBank(req, parsed);
  return ok(res, undefined, "Bank details submitted for verification");
}));
apiRouter.get("/admin/bank/:employeeId", ...requireAdmin, asyncHandler(async (req, res) => {
  const reveal = req.query.reveal === "1";
  return ok(res, await payroll.adminBank(param(req, "employeeId"), reveal));
}));
apiRouter.post("/admin/bank/:employeeId/verify", ...requireAdmin, asyncHandler(async (req, res) => {
  const status = field(req, "status") as "VERIFIED" | "REJECTED";
  await payroll.verifyBank(req, param(req, "employeeId"), status, field(req, "reason") || undefined);
  return ok(res, undefined, `Bank details ${status.toLowerCase()}`);
}));
apiRouter.get("/employee/payroll", ...requireApprovedEmployee, asyncHandler(async (req, res) => ok(res, await payroll.employeePayroll(req.auth!.employeeId!))));
apiRouter.get("/admin/payroll", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req);
  return ok(res, await payroll.adminPayroll({
    q: typeof req.query.q === "string" ? req.query.q : "",
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    page,
    limit,
  }));
}));
apiRouter.post("/admin/payroll", ...requireAdmin, upload.single("payslip"), asyncHandler(async (req, res) => {
  const { salarySchema } = await import("../validators/index.js");
  const parsed = salarySchema.parse({
    employeeId: field(req, "employeeId"),
    month: field(req, "month"),
    year: field(req, "year"),
    amount: field(req, "amount") || undefined,
    baseSalary: field(req, "baseSalary") || undefined,
    deductions: field(req, "deductions") || undefined,
    bonuses: field(req, "bonuses") || undefined,
    status: field(req, "status") || "PENDING",
    paymentDate: field(req, "paymentDate") || null,
    paymentRef: field(req, "paymentRef") || null,
    notes: field(req, "notes") || null,
  });
  await payroll.upsertSalary(req, parsed, req.file);
  return ok(res, undefined, "Salary record saved");
}));

/* ---------- documents / files ---------- */
apiRouter.get("/documents", requireAuth, asyncHandler(async (req, res) => {
  if (req.auth!.role === "ADMIN") {
    const { page, limit } = parsePage(req);
    return ok(res, await documents.adminDocuments({ page, limit }));
  }
  if (!req.auth!.employeeId) throw errors.forbidden();
  await assertApprovedEmployee(req);
  return ok(res, await documents.employeeDocuments(req.auth!.employeeId));
}));
apiRouter.post("/documents", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  if (req.auth!.role === "EMPLOYEE") await assertApprovedEmployee(req);
  await documents.uploadDocument(req, {
    category: field(req, "category") as DocumentCategory,
    title: field(req, "title"),
    employeeId: field(req, "employeeId") || undefined,
  }, req.file);
  return ok(res, undefined, "Document uploaded");
}));
apiRouter.get("/documents/:id/download", requireAuth, asyncHandler(async (req, res) => {
  const { file, buffer } = await documents.downloadDocument(req.auth!, param(req, "id"));
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(buffer);
}));
apiRouter.get("/files/:id", requireAuth, asyncHandler(async (req, res) => {
  const { file, buffer } = await documents.downloadFile(req.auth!, param(req, "id"));
  const inline = file.mimeType.startsWith("image/");
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.originalName)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(buffer);
}));
apiRouter.get("/admin/documents", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req);
  return ok(res, await documents.adminDocuments({
    q: typeof req.query.q === "string" ? req.query.q : "",
    employeeId: typeof req.query.employeeId === "string" ? req.query.employeeId : undefined,
    page,
    limit,
  }));
}));

/* ---------- notifications / announcements ---------- */
apiRouter.get("/notifications", requireAuth, asyncHandler(async (req, res) => ok(res, await notifications.listNotifications(req.auth!.userId))));
apiRouter.get("/notifications/unread-count", requireAuth, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.auth!.userId, readAt: null } });
  return ok(res, { count });
}));
apiRouter.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
  await notifications.markRead(req.auth!.userId, param(req, "id"));
  return ok(res);
}));
apiRouter.post("/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  await notifications.markAllRead(req.auth!.userId);
  return ok(res, undefined, "All notifications marked as read");
}));
apiRouter.get("/announcements", requireAuth, asyncHandler(async (_req, res) => ok(res, await announcements.listAnnouncements(true))));
apiRouter.get("/admin/announcements", ...requireAdmin, asyncHandler(async (_req, res) => ok(res, await announcements.listAnnouncements(false))));
apiRouter.post("/admin/announcements", ...requireAdmin, upload.single("attachment"), asyncHandler(async (req, res) => {
  await announcements.createAnnouncement(req, {
    title: field(req, "title"),
    message: field(req, "message"),
    priority: (field(req, "priority") as "LOW" | "NORMAL" | "HIGH" | "URGENT") || "NORMAL",
    publishDate: field(req, "publishDate") || undefined,
  }, req.file);
  return ok(res, undefined, "Announcement published");
}));
apiRouter.patch("/admin/announcements/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  await announcements.updateAnnouncement(req, param(req, "id"), {
    title: field(req, "title") || undefined,
    message: field(req, "message") || undefined,
    priority: (field(req, "priority") as "LOW" | "NORMAL" | "HIGH" | "URGENT") || undefined,
    publishDate: field(req, "publishDate") || undefined,
    active: field(req, "active") ? bool(req, "active") : undefined,
  });
  return ok(res, undefined, "Announcement updated");
}));
apiRouter.delete("/admin/announcements/:id", ...requireAdmin, asyncHandler(async (req, res) => {
  await announcements.deleteAnnouncement(req, param(req, "id"));
  return ok(res, undefined, "Announcement removed");
}));

/* ---------- audit / settings / reports ---------- */
apiRouter.get("/admin/audit", ...requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = parsePage(req, 50);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  return ok(res, await admin.listAudit(page, limit, q));
}));
apiRouter.get("/admin/settings", ...requireAdmin, asyncHandler(async (_req, res) => {
  const s = await settings.getSettings();
  const types = await prisma.leaveType.findMany({ orderBy: { name: "asc" } });
  return ok(res, { settings: s, leaveTypes: types });
}));
apiRouter.patch("/admin/settings", ...requireAdmin, upload.single("logo"), asyncHandler(async (req, res) => {
  const workingDays = (req.body.workingDays ?? list(req, "workingDays")).map(Number).filter((n: number) => !Number.isNaN(n));
  let logoFileId: string | undefined;
  if (req.file) {
    const file = await storeBuffer({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      kind: "image",
      uploadedById: req.auth!.userId,
      ownerType: "DOCUMENT",
      relatedId: "company-logo",
    });
    logoFileId = file.id;
  }
  await settings.saveSettings({
    companyName: field(req, "companyName") || "DropZen",
    legalName: field(req, "legalName") || "DropZen Technologies",
    timezone: field(req, "timezone") || "Asia/Kolkata",
    workingDays: workingDays.length ? workingDays : [1, 2, 3, 4, 5],
    workStart: field(req, "workStart") || "09:30",
    workEnd: field(req, "workEnd") || "18:30",
    lateAfter: field(req, "lateAfter") || "10:00",
    halfDayAfter: field(req, "halfDayAfter") || "13:30",
    defaultTaskHours: Number(field(req, "defaultTaskHours") || 4),
    notifyDeadlineHours: Number(field(req, "notifyDeadlineHours") || 24),
    payCycleDay: Number(field(req, "payCycleDay") || 1),
    currency: field(req, "currency") || "INR",
    companyEmail: field(req, "companyEmail") || null,
    companyPhone: field(req, "companyPhone") || null,
    companyAddress: field(req, "companyAddress") || null,
    website: field(req, "website") || null,
    sessionTtlHours: Number(field(req, "sessionTtlHours") || 24),
    passwordMinLength: Number(field(req, "passwordMinLength") || 8),
    loginRateLimit: Number(field(req, "loginRateLimit") || 10),
    emailNotifications: bool(req, "emailNotifications"),
    inAppNotifications: bool(req, "inAppNotifications"),
    ...(logoFileId ? { logoFileId } : {}),
  });
  const { writeAudit } = await import("../services/audit.js");
  await writeAudit({ actorId: req.auth!.userId, action: "SETTINGS_UPDATED", entityType: "Settings", entityId: "default", ip: req.ip });
  return ok(res, undefined, "Settings saved");
}));
apiRouter.post("/admin/leave-types", ...requireAdmin, asyncHandler(async (req, res) => {
  await admin.upsertLeaveType({
    id: field(req, "id") || undefined,
    name: field(req, "name"),
    daysPerYear: Number(field(req, "daysPerYear") || 0),
    paid: bool(req, "paid") || field(req, "paid") === "true",
    carryForward: bool(req, "carryForward") || field(req, "carryForward") === "true",
  });
  return ok(res, undefined, "Leave type saved");
}));

async function sendExport(res: import("express").Response, type: string, asCsv: boolean) {
  if (asCsv) {
    const csv = await reports.csvFor(type);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);
    return res.send(csv);
  }
  const wb = await reports.workbookFor(type);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${type}.xlsx"`);
  return res.send(buf);
}

apiRouter.get("/admin/reports/:type", ...requireAdmin, asyncHandler(async (req, res) => {
  const raw = param(req, "type");
  const asCsv = raw.endsWith(".csv");
  const type = raw.replace(/\.csv$/, "");
  return sendExport(res, type, asCsv);
}));
apiRouter.get("/export/:type", ...requireAdmin, asyncHandler(async (req, res) => {
  const asCsv = req.query.format === "csv" || param(req, "type").endsWith(".csv");
  const type = param(req, "type").replace(/\.csv$/, "");
  return sendExport(res, type, asCsv);
}));
