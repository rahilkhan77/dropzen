import type { Request } from "express";
import type { BankVerificationStatus, SalaryStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { encryptText, last4, maskAccount, maskPan, decryptText } from "../utils/crypto.js";
import { writeAudit } from "./audit.js";
import { notify } from "./notify.js";
import { storeBuffer } from "./storage.js";
import { EmailService } from "./email.js";
import { clientIp } from "../middleware/auth.js";
import { paged } from "../utils/pagination.js";
import type { bankSchema, salarySchema } from "../validators/index.js";
import type { z } from "zod";

export function publicBank(details: {
  accountHolderName: string;
  bankName: string;
  ifsc: string;
  upiId: string | null;
  accountLast4: string;
  panLast4: string | null;
  status: BankVerificationStatus;
  rejectionReason: string | null;
  otherInfo?: string | null;
} | null) {
  if (!details) return null;
  return {
    accountHolderName: details.accountHolderName,
    bankName: details.bankName,
    ifsc: details.ifsc,
    upiId: details.upiId,
    accountLast4: details.accountLast4,
    panLast4: details.panLast4,
    status: details.status,
    rejectionReason: details.rejectionReason,
    otherInfo: details.otherInfo ?? null,
    accountNumberMasked: maskAccount(details.accountLast4),
    panMasked: maskPan(details.panLast4),
  };
}

export async function getOwnBank(employeeId: string) {
  const details = await prisma.bankDetails.findUnique({ where: { employeeId } });
  return publicBank(details);
}

export async function upsertBank(req: Request, data: z.infer<typeof bankSchema>) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Employee profile required");
  const pan = data.pan && data.pan.length ? data.pan : undefined;
  await prisma.bankDetails.upsert({
    where: { employeeId },
    update: {
      accountHolderName: data.accountHolderName,
      bankName: data.bankName,
      accountNumberEnc: encryptText(data.accountNumber),
      ifsc: data.ifsc,
      upiId: data.upiId ?? null,
      panEnc: pan ? encryptText(pan) : null,
      otherInfo: data.otherInfo ?? null,
      accountLast4: last4(data.accountNumber),
      panLast4: pan ? last4(pan) : null,
      status: "PENDING",
      rejectionReason: null,
      verifiedAt: null,
      verifiedById: null,
    },
    create: {
      employeeId,
      accountHolderName: data.accountHolderName,
      bankName: data.bankName,
      accountNumberEnc: encryptText(data.accountNumber),
      ifsc: data.ifsc,
      upiId: data.upiId ?? null,
      panEnc: pan ? encryptText(pan) : null,
      otherInfo: data.otherInfo ?? null,
      accountLast4: last4(data.accountNumber),
      panLast4: pan ? last4(pan) : null,
    },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "BANK_DETAILS_UPDATED",
    entityType: "BankDetails",
    entityId: employeeId,
    ip: clientIp(req),
  });
}

export async function adminBank(employeeId: string, reveal: boolean) {
  const details = await prisma.bankDetails.findUnique({
    where: { employeeId },
    include: { employee: true },
  });
  if (!details) throw errors.notFound("Bank details not found");
  const base = publicBank(details)!;
  if (!reveal) return { ...base, employee: details.employee };
  return {
    ...base,
    employee: details.employee,
    accountNumber: decryptText(details.accountNumberEnc),
    pan: details.panEnc ? decryptText(details.panEnc) : null,
  };
}

export async function verifyBank(
  req: Request,
  employeeId: string,
  status: "VERIFIED" | "REJECTED",
  reason?: string,
) {
  const details = await prisma.bankDetails.findUnique({
    where: { employeeId },
    include: { employee: true },
  });
  if (!details) throw errors.notFound("Bank details not found");
  await prisma.bankDetails.update({
    where: { employeeId },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? reason ?? "Rejected" : null,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
      verifiedById: req.auth!.userId,
    },
  });
  await notify({
    userId: details.employee.userId,
    type: "BANK",
    title: status === "VERIFIED" ? "Bank details verified" : "Bank details rejected",
    body: status === "VERIFIED" ? "Your payroll details are verified." : reason || "Please update your bank details.",
    href: "/bank",
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: status === "VERIFIED" ? "BANK_VERIFIED" : "BANK_REJECTED",
    entityType: "BankDetails",
    entityId: employeeId,
    ip: clientIp(req),
  });
}

function salaryDto(row: { netSalary: number; baseSalary: number; deductions: number; bonuses: number }) {
  return { ...row, amount: row.netSalary };
}

export async function upsertSalary(req: Request, data: z.infer<typeof salarySchema>, payslip?: Express.Multer.File) {
  const base = data.baseSalary ?? data.amount;
  if (!base) throw errors.validation("Employee, period and amount are required");
  const deductions = data.deductions ?? 0;
  const bonuses = data.bonuses ?? 0;
  const netSalary = base - deductions + bonuses;
  const status = (data.status ?? "PENDING") as SalaryStatus;

  const existing = await prisma.salaryRecord.findUnique({
    where: { employeeId_month_year: { employeeId: data.employeeId, month: data.month, year: data.year } },
  });
  const record = await prisma.salaryRecord.upsert({
    where: { employeeId_month_year: { employeeId: data.employeeId, month: data.month, year: data.year } },
    update: {
      baseSalary: base,
      deductions,
      bonuses,
      netSalary,
      status,
      paymentDate: data.paymentDate || null,
      paymentRef: data.paymentRef || null,
      notes: data.notes || null,
      updatedById: req.auth!.userId,
    },
    create: {
      employeeId: data.employeeId,
      month: data.month,
      year: data.year,
      baseSalary: base,
      deductions,
      bonuses,
      netSalary,
      status,
      paymentDate: data.paymentDate || null,
      paymentRef: data.paymentRef || null,
      notes: data.notes || null,
      updatedById: req.auth!.userId,
    },
    include: { employee: { include: { user: true } } },
  });

  if (payslip) {
    const file = await storeBuffer({
      buffer: payslip.buffer,
      originalName: payslip.originalname,
      mimeType: payslip.mimetype,
      kind: "document",
      uploadedById: req.auth!.userId,
      ownerType: "PAYSLIP",
      relatedId: record.id,
      employeeId: data.employeeId,
    });
    await prisma.salaryRecord.update({ where: { id: record.id }, data: { payslipFileId: file.id } });
    await prisma.document.create({
      data: {
        employeeId: data.employeeId,
        category: "PAYSLIP",
        title: `Payslip ${String(data.month).padStart(2, "0")}/${data.year}`,
        fileId: file.id,
      },
    });
    await notify({
      userId: record.employee.userId,
      type: "DOCUMENT",
      title: "Payslip uploaded",
      body: `Payslip for ${data.month}/${data.year} is ready to download.`,
      href: "/salary",
    });
    await writeAudit({
      actorId: req.auth!.userId,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: file.id,
      metadata: { kind: "PAYSLIP", month: data.month, year: data.year },
      ip: clientIp(req),
    });
  }

  await writeAudit({
    actorId: req.auth!.userId,
    action: existing ? "SALARY_UPDATED" : "SALARY_CREATED",
    entityType: "SalaryRecord",
    entityId: record.id,
    ip: clientIp(req),
  });

  if (status === "PAID") {
    await notify({
      userId: record.employee.userId,
      type: "SALARY_PAID",
      title: "Salary marked as paid",
      body: `Payment for ${data.month}/${data.year} has been processed.`,
      href: "/salary",
    });
    await EmailService.sendSalaryPaid({
      to: record.employee.user.email,
      name: record.employee.fullName,
      month: data.month,
      year: data.year,
    });
    await writeAudit({
      actorId: req.auth!.userId,
      action: "SALARY_PAID",
      entityType: "SalaryRecord",
      entityId: record.id,
      ip: clientIp(req),
    });
  }
  return salaryDto(record);
}

export async function employeePayroll(employeeId: string) {
  const records = await prisma.salaryRecord.findMany({
    where: { employeeId },
    include: { payslip: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return records.map((r) => salaryDto(r));
}

export async function adminPayroll(opts: { q?: string; month?: number; year?: number; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const where = {
    AND: [
      opts.q
        ? {
            OR: [
              { fullName: { contains: opts.q, mode: "insensitive" as const } },
              { employeeCode: { contains: opts.q, mode: "insensitive" as const } },
              { user: { email: { contains: opts.q, mode: "insensitive" as const } } },
            ],
          }
        : {},
      opts.month || opts.year
        ? {
            salaryRecords: {
              some: {
                ...(opts.month ? { month: opts.month } : {}),
                ...(opts.year ? { year: opts.year } : {}),
              },
            },
          }
        : {},
    ],
  };
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        bankDetails: true,
        salaryRecords: {
          where: {
            ...(opts.month ? { month: opts.month } : {}),
            ...(opts.year ? { year: opts.year } : {}),
          },
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 6,
        },
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);
  return paged(
    employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      bankDetails: publicBank(e.bankDetails),
      salaryRecords: e.salaryRecords.map((s) => salaryDto(s)),
    })),
    total,
    page,
    limit,
  );
}
