import type { Request } from "express";
import type { DocumentCategory, KycStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { encryptText, last4, maskPan, decryptText } from "../utils/crypto.js";
import { writeAudit } from "./audit.js";
import { notify } from "./notify.js";
import { storeBuffer } from "./storage.js";
import { clientIp } from "../middleware/auth.js";
import { EmailService } from "./email.js";
import { env } from "../config/env.js";
import { ensureLeaveBalances } from "./leave.js";
import { publicBank } from "./payroll.js";

const LOCKED: KycStatus[] = ["PENDING_VERIFICATION", "APPROVED"];
const KYC_DOC_CATEGORIES: DocumentCategory[] = ["ID", "PAN", "BANK_PROOF", "ADDRESS_PROOF", "OTHER"];

export function kycLocked(status: KycStatus) {
  return LOCKED.includes(status);
}

function missingFor(employee: {
  fullName: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  panLast4: string | null;
  govIdType: string | null;
  govIdLast4: string | null;
  kycDeclarationAt: Date | null;
  user: { email: string };
  bankDetails: { accountLast4: string; ifsc: string; accountHolderName: string; bankName: string } | null;
  documents: { category: DocumentCategory }[];
}) {
  const missing: string[] = [];
  if (!employee.fullName) missing.push("Full name");
  if (!employee.dateOfBirth) missing.push("Date of birth");
  if (!employee.gender) missing.push("Gender");
  if (!employee.phone) missing.push("Phone number");
  if (!employee.user.email) missing.push("Email");
  if (!employee.address) missing.push("Address");
  if (!employee.city) missing.push("City");
  if (!employee.state) missing.push("State");
  if (!employee.pinCode) missing.push("PIN code");
  if (!employee.emergencyName || !employee.emergencyPhone) missing.push("Emergency contact");
  if (!employee.panLast4) missing.push("PAN");
  if (!employee.govIdType || !employee.govIdLast4) missing.push("Government ID");
  if (!employee.documents.some((d) => d.category === "ID")) missing.push("Identity document");
  if (!employee.bankDetails?.accountHolderName) missing.push("Account holder name");
  if (!employee.bankDetails?.bankName) missing.push("Bank name");
  if (!employee.bankDetails?.accountLast4) missing.push("Bank account number");
  if (!employee.bankDetails?.ifsc) missing.push("IFSC");
  if (!employee.documents.some((d) => d.category === "BANK_PROOF" || d.category === "PAN")) {
    missing.push("Bank proof or PAN document");
  }
  if (!employee.kycDeclarationAt) missing.push("Accuracy declaration");
  return missing;
}

function progress(missingCount: number, total = 18) {
  return Math.max(0, Math.min(100, Math.round(((total - missingCount) / total) * 100)));
}

async function load(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { email: true, username: true, status: true } },
      bankDetails: true,
      documents: { include: { file: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!employee) throw errors.notFound("Employee not found");
  return employee;
}

function serialize(employee: Awaited<ReturnType<typeof load>>, reveal: boolean) {
  const miss = missingFor(employee);
  const bank = publicBank(employee.bankDetails);
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    kycStatus: employee.kycStatus,
    kycSubmittedAt: employee.kycSubmittedAt,
    kycReviewedAt: employee.kycReviewedAt,
    kycRejectionReason: employee.kycRejectionReason,
    locked: kycLocked(employee.kycStatus),
    progress: progress(miss.length),
    missing: miss,
    personal: {
      fullName: employee.fullName,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      phone: employee.phone,
      email: employee.user.email,
      address: employee.address,
      city: employee.city,
      state: employee.state,
      pinCode: employee.pinCode,
      emergencyName: employee.emergencyName,
      emergencyPhone: employee.emergencyPhone,
    },
    identity: {
      panMasked: maskPan(employee.panLast4),
      govIdType: employee.govIdType,
      govIdMasked: employee.govIdLast4 ? `••••${employee.govIdLast4}` : null,
      pan: reveal && employee.panEnc ? decryptText(employee.panEnc) : undefined,
      govIdNumber: reveal && employee.govIdNumberEnc ? decryptText(employee.govIdNumberEnc) : undefined,
    },
    bank: bank
      ? {
          ...bank,
          accountNumber: reveal && employee.bankDetails ? decryptText(employee.bankDetails.accountNumberEnc) : undefined,
        }
      : null,
    documents: employee.documents.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      fileId: d.fileId,
      originalName: d.file.originalName,
      createdAt: d.createdAt,
    })),
  };
}

export async function getOwnKyc(employeeId: string) {
  return serialize(await load(employeeId), false);
}

export async function listAdminKyc(opts: { q?: string; status?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const where = {
    ...(opts.status ? { kycStatus: opts.status as KycStatus } : {}),
    ...(opts.q
      ? {
          OR: [
            { fullName: { contains: opts.q, mode: "insensitive" as const } },
            { employeeCode: { contains: opts.q, mode: "insensitive" as const } },
            { user: { email: { contains: opts.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        user: { select: { email: true, status: true } },
        bankDetails: true,
        documents: true,
      },
      orderBy: [
        { kycSubmittedAt: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);
  return {
    items: rows.map((employee) => {
      const miss = missingFor(employee);
      return {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        email: employee.user.email,
        department: employee.department,
        kycStatus: employee.kycStatus,
        kycSubmittedAt: employee.kycSubmittedAt,
        progress: progress(miss.length),
        missingCount: miss.length,
        accountStatus: employee.user.status,
      };
    }),
    total,
    page,
    limit,
  };
}

export async function getAdminKyc(employeeId: string, reveal = false) {
  return serialize(await load(employeeId), reveal);
}

export async function saveDraft(
  req: Request,
  data: {
    fullName?: string;
    dateOfBirth?: string;
    gender?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pinCode?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    pan?: string;
    govIdType?: string;
    govIdNumber?: string;
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    upiId?: string;
  },
) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Employee profile required");
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw errors.notFound("Employee not found");
  if (kycLocked(employee.kycStatus)) {
    throw errors.forbidden("Submitted verification cannot be edited until an administrator sends it back.");
  }

  const pan = data.pan?.replace(/\s/g, "").toUpperCase();
  const govId = data.govIdNumber?.replace(/\s/g, "").toUpperCase();
  if (data.pinCode && !/^\d{6}$/.test(data.pinCode)) throw errors.validation("PIN code must be 6 digits");
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw errors.validation("PAN must look like ABCDE1234F");
  if (data.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(data.ifsc)) throw errors.validation("IFSC must look like HDFC0001234");
  if (data.accountNumber && !/^[0-9]{6,24}$/.test(data.accountNumber)) {
    throw errors.validation("Account number must be numeric");
  }

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      fullName: data.fullName ?? employee.fullName,
      dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00`) : employee.dateOfBirth,
      gender: data.gender ?? employee.gender,
      phone: data.phone ?? employee.phone,
      address: data.address ?? employee.address,
      city: data.city ?? employee.city,
      state: data.state ?? employee.state,
      pinCode: data.pinCode ?? employee.pinCode,
      emergencyName: data.emergencyName ?? employee.emergencyName,
      emergencyPhone: data.emergencyPhone ?? employee.emergencyPhone,
      govIdType: data.govIdType ?? employee.govIdType,
      panEnc: pan ? encryptText(pan) : employee.panEnc,
      panLast4: pan ? last4(pan) : employee.panLast4,
      govIdNumberEnc: govId ? encryptText(govId) : employee.govIdNumberEnc,
      govIdLast4: govId ? last4(govId) : employee.govIdLast4,
      kycStatus:
        employee.kycStatus === "NOT_STARTED" || employee.kycStatus === "REJECTED" ? "INCOMPLETE" : employee.kycStatus,
    },
  });

  if (data.accountHolderName && data.bankName && data.accountNumber && data.ifsc) {
    await prisma.bankDetails.upsert({
      where: { employeeId },
      update: {
        accountHolderName: data.accountHolderName,
        bankName: data.bankName,
        accountNumberEnc: encryptText(data.accountNumber),
        ifsc: data.ifsc.toUpperCase(),
        upiId: data.upiId ?? null,
        panEnc: pan ? encryptText(pan) : undefined,
        panLast4: pan ? last4(pan) : undefined,
        accountLast4: last4(data.accountNumber),
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
        ifsc: data.ifsc.toUpperCase(),
        upiId: data.upiId ?? null,
        panEnc: pan ? encryptText(pan) : null,
        panLast4: pan ? last4(pan) : null,
        accountLast4: last4(data.accountNumber),
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

  await writeAudit({
    actorId: req.auth!.userId,
    action: "KYC_DRAFT_SAVED",
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
  return getOwnKyc(employeeId);
}

export async function submitKyc(req: Request) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Employee profile required");
  const employee = await load(employeeId);
  if (kycLocked(employee.kycStatus)) {
    throw errors.conflict("Verification is already submitted.");
  }
  const miss = missingFor({ ...employee, kycDeclarationAt: new Date() }).filter((m) => m !== "Accuracy declaration");
  if (miss.length) throw errors.validation(`Complete required information before submitting: ${miss.join(", ")}`);

  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      kycStatus: "PENDING_VERIFICATION",
      kycSubmittedAt: new Date(),
      kycDeclarationAt: new Date(),
      kycRejectionReason: null,
    },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "KYC_SUBMITTED",
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: "KYC_SUBMITTED",
      title: "Verification submitted",
      body: `${employee.fullName} submitted employee verification.`,
      href: `/admin/verification/${employeeId}`,
    });
    await EmailService.sendKycSubmitted({
      to: admin.email,
      employeeName: employee.fullName,
      reviewUrl: `${env.FRONTEND_URL}/admin/verification/${employeeId}`,
    });
  }
  await notify({
    userId: req.auth!.userId,
    type: "KYC_PENDING",
    title: "Verification under review",
    body: "Your information was submitted. You will be notified when an administrator reviews it.",
    href: "/employee/kyc",
  });
  return getOwnKyc(employeeId);
}

export async function uploadKycDocument(
  req: Request,
  data: { category: DocumentCategory; title: string },
  file: Express.Multer.File | undefined,
) {
  const employeeId = req.auth!.employeeId;
  if (!employeeId) throw errors.forbidden("Employee profile required");
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw errors.notFound("Employee not found");
  if (kycLocked(employee.kycStatus)) {
    throw errors.forbidden("Submitted verification cannot be edited until an administrator sends it back.");
  }
  if (!file) throw errors.validation("Choose a file to upload");
  if (!KYC_DOC_CATEGORIES.includes(data.category)) throw errors.validation("Invalid document category");
  const saved = await storeBuffer({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    kind: "document",
    uploadedById: req.auth!.userId,
    ownerType: "KYC",
    relatedId: employeeId,
    employeeId,
  });
  await prisma.document.create({
    data: {
      employeeId,
      category: data.category,
      title: data.title || data.category,
      fileId: saved.id,
    },
  });
  if (employee.kycStatus === "NOT_STARTED") {
    await prisma.employee.update({ where: { id: employeeId }, data: { kycStatus: "INCOMPLETE" } });
  }
  await writeAudit({
    actorId: req.auth!.userId,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: saved.id,
    metadata: { category: data.category },
    ip: clientIp(req),
  });
  return getOwnKyc(employeeId);
}

export async function reviewKyc(
  req: Request,
  employeeId: string,
  decision: "APPROVED" | "REJECTED" | "REQUEST_CORRECTION",
  reason?: string,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!employee) throw errors.notFound("Employee not found");
  if (decision !== "APPROVED" && !reason?.trim()) {
    throw errors.validation("Provide a reason for the employee.");
  }
  const nextStatus: KycStatus =
    decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "INCOMPLETE";
  await prisma.employee.update({
    where: { id: employeeId },
    data: {
      kycStatus: nextStatus,
      kycReviewedAt: new Date(),
      kycReviewedById: req.auth!.userId,
      kycRejectionReason: decision === "APPROVED" ? null : reason!.trim(),
    },
  });
  if (decision === "APPROVED") {
    await prisma.bankDetails.updateMany({
      where: { employeeId, status: { not: "VERIFIED" } },
      data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: req.auth!.userId, rejectionReason: null },
    });
    await ensureLeaveBalances(employeeId);
    await EmailService.sendKycApproved({ to: employee.user.email, name: employee.fullName });
  } else {
    await EmailService.sendKycRejected({
      to: employee.user.email,
      name: employee.fullName,
      reason: reason!.trim(),
    });
  }
  const action =
    decision === "APPROVED" ? "KYC_APPROVED" : decision === "REJECTED" ? "KYC_REJECTED" : "KYC_CORRECTION_REQUESTED";
  await writeAudit({
    actorId: req.auth!.userId,
    action,
    entityType: "Employee",
    entityId: employeeId,
    ip: clientIp(req),
  });
  await notify({
    userId: employee.userId,
    type: action,
    title:
      decision === "APPROVED"
        ? "Verification approved"
        : decision === "REJECTED"
          ? "Verification rejected"
          : "Please update your verification",
    body: decision === "APPROVED" ? "Your workspace is now fully available." : reason!.trim(),
    href: "/employee/kyc",
  });
  return getAdminKyc(employeeId, false);
}
