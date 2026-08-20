import ExcelJS from "exceljs";
import { prisma } from "../config/db.js";
import { decryptText, maskAccount, maskPan } from "../utils/crypto.js";
import { monthName } from "../utils/dates.js";
import { errors } from "../utils/errors.js";

const ASSIGNMENT_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REVISION_REQUIRED: "Revision Required",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
};

export async function workbookFor(type: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DropZen";
  wb.created = new Date();

  if (type === "employees") {
    const sheet = wb.addWorksheet("Employees");
    sheet.columns = [
      { header: "Employee ID", key: "code", width: 14 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 28 },
      { header: "Department", key: "department", width: 18 },
      { header: "Designation", key: "designation", width: 20 },
      { header: "Joining date", key: "joining", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Phone", key: "phone", width: 16 },
    ];
    const rows = await prisma.employee.findMany({ include: { user: true }, orderBy: { employeeCode: "asc" } });
    for (const e of rows) {
      sheet.addRow({
        code: e.employeeCode,
        name: e.fullName,
        email: e.user.email,
        department: e.department,
        designation: e.designation,
        joining: e.joiningDate.toISOString().slice(0, 10),
        status: e.user.status,
        phone: e.phone,
      });
    }
  } else if (type === "attendance") {
    const sheet = wb.addWorksheet("Attendance");
    sheet.columns = [
      { header: "Employee ID", key: "code", width: 14 },
      { header: "Name", key: "name", width: 24 },
      { header: "Date", key: "date", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Check-in", key: "in", width: 22 },
      { header: "Check-out", key: "out", width: 22 },
    ];
    const rows = await prisma.attendance.findMany({
      include: { employee: true },
      orderBy: [{ dateKey: "desc" }, { employee: { fullName: "asc" } }],
    });
    for (const r of rows) {
      sheet.addRow({
        code: r.employee.employeeCode,
        name: r.employee.fullName,
        date: r.dateKey,
        status: r.status,
        in: r.checkInAt?.toISOString() ?? "",
        out: r.checkOutAt?.toISOString() ?? "",
      });
    }
  } else if (type === "tasks" || type === "completions") {
    const sheet = wb.addWorksheet("Task completions");
    sheet.columns = [
      { header: "Task", key: "title", width: 32 },
      { header: "Date", key: "date", width: 14 },
      { header: "Employee", key: "name", width: 24 },
      { header: "Status", key: "status", width: 18 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Deadline", key: "deadline", width: 22 },
    ];
    const rows = await prisma.taskAssignment.findMany({
      include: { task: true, employee: true },
      orderBy: { task: { dateKey: "desc" } },
    });
    for (const r of rows) {
      sheet.addRow({
        title: r.task.title,
        date: r.task.dateKey,
        name: r.employee.fullName,
        status: ASSIGNMENT_LABELS[r.status] ?? r.status,
        priority: r.task.priority,
        deadline: r.task.deadline.toISOString(),
      });
    }
  } else if (type === "payroll") {
    const sheet = wb.addWorksheet("Payroll");
    sheet.columns = [
      { header: "Employee ID", key: "code", width: 14 },
      { header: "Name", key: "name", width: 24 },
      { header: "Month", key: "month", width: 16 },
      { header: "Base", key: "base", width: 12 },
      { header: "Deductions", key: "deductions", width: 12 },
      { header: "Bonuses", key: "bonuses", width: 12 },
      { header: "Net", key: "amount", width: 12 },
      { header: "Status", key: "status", width: 12 },
      { header: "Payment date", key: "paid", width: 14 },
      { header: "Reference", key: "ref", width: 18 },
      { header: "Bank", key: "bank", width: 18 },
      { header: "Account", key: "account", width: 16 },
      { header: "IFSC", key: "ifsc", width: 14 },
      { header: "PAN", key: "pan", width: 14 },
    ];
    const rows = await prisma.salaryRecord.findMany({
      include: { employee: { include: { bankDetails: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    for (const r of rows) {
      const bank = r.employee.bankDetails;
      sheet.addRow({
        code: r.employee.employeeCode,
        name: r.employee.fullName,
        month: `${monthName(r.month)} ${r.year}`,
        base: r.baseSalary,
        deductions: r.deductions,
        bonuses: r.bonuses,
        amount: r.netSalary,
        status: r.status,
        paid: r.paymentDate ?? "",
        ref: r.paymentRef ?? "",
        bank: bank?.bankName ?? "",
        account: bank ? maskAccount(bank.accountLast4) : "",
        ifsc: bank?.ifsc ?? "",
        pan: maskPan(bank?.panLast4),
      });
    }
  } else if (type === "leave") {
    const sheet = wb.addWorksheet("Leave");
    sheet.columns = [
      { header: "Employee", key: "name", width: 24 },
      { header: "Type", key: "type", width: 16 },
      { header: "Start", key: "start", width: 12 },
      { header: "End", key: "end", width: 12 },
      { header: "Days", key: "days", width: 8 },
      { header: "Status", key: "status", width: 12 },
      { header: "Reason", key: "reason", width: 40 },
    ];
    const rows = await prisma.leaveRequest.findMany({
      include: { employee: true, leaveType: true },
      orderBy: { createdAt: "desc" },
    });
    for (const r of rows) {
      sheet.addRow({
        name: r.employee.fullName,
        type: r.leaveType.name,
        start: r.startDate,
        end: r.endDate,
        days: r.days,
        status: r.status,
        reason: r.reason,
      });
    }
  } else if (type === "payroll-full") {
    const sheet = wb.addWorksheet("Payroll sensitive");
    sheet.columns = [
      { header: "Employee", key: "name", width: 24 },
      { header: "Account holder", key: "holder", width: 24 },
      { header: "Bank", key: "bank", width: 20 },
      { header: "Account number", key: "account", width: 20 },
      { header: "IFSC", key: "ifsc", width: 14 },
      { header: "UPI", key: "upi", width: 20 },
      { header: "PAN", key: "pan", width: 14 },
      { header: "Verification", key: "status", width: 14 },
    ];
    const rows = await prisma.bankDetails.findMany({ include: { employee: true } });
    for (const r of rows) {
      sheet.addRow({
        name: r.employee.fullName,
        holder: r.accountHolderName,
        bank: r.bankName,
        account: decryptText(r.accountNumberEnc),
        ifsc: r.ifsc,
        upi: r.upiId ?? "",
        pan: r.panEnc ? decryptText(r.panEnc) : "",
        status: r.status,
      });
    }
  } else {
    throw errors.validation("Unknown export type");
  }

  return wb;
}

export async function csvFor(type: string) {
  const wb = await workbookFor(type);
  const sheet = wb.worksheets[0];
  const rows: string[] = [];
  sheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    rows.push(values.join(","));
  });
  return rows.join("\n");
}
