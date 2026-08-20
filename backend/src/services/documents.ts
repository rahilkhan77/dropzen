import type { Request } from "express";
import type { DocumentCategory, FileAsset } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { writeAudit } from "./audit.js";
import { notify } from "./notify.js";
import { storeBuffer, readStoredFile } from "./storage.js";
import { clientIp } from "../middleware/auth.js";
import type { AuthContext } from "../types/auth.js";

const EMPLOYEE_UPLOAD: DocumentCategory[] = ["ID", "PAN", "BANK_PROOF", "ADDRESS_PROOF", "OTHER"];

export async function canAccessFile(auth: AuthContext, file: FileAsset) {
  if (auth.role === "ADMIN") return true;
  if (file.uploadedById === auth.userId) return true;
  if (file.employeeId && file.employeeId === auth.employeeId) return true;
  if (file.ownerType === "ANNOUNCEMENT") return true;

  if (file.ownerType === "TASK") {
    const linked = await prisma.taskFile.findFirst({
      where: {
        fileId: file.id,
        task: { assignments: { some: { employeeId: auth.employeeId ?? "" } } },
      },
    });
    if (linked) return true;
  }

  if (file.ownerType === "SUBMISSION") {
    const version = await prisma.submissionVersion.findFirst({
      where: { fileId: file.id },
      include: { submission: { include: { assignment: true } } },
    });
    if (version?.submission.assignment.employeeId === auth.employeeId) return true;
  }

  return false;
}

export async function downloadFile(auth: AuthContext, fileId: string) {
  const file = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!file) throw errors.notFound("File not found");
  if (!(await canAccessFile(auth, file))) throw errors.forbidden();
  const buffer = await readStoredFile(file.storageKey);
  return { file, buffer };
}

export async function uploadDocument(
  req: Request,
  data: { category: DocumentCategory; title: string; employeeId?: string },
  file: Express.Multer.File | undefined,
) {
  if (!data.category || !data.title || !file) throw errors.validation("Title, category and file are required");
  let employeeId = data.employeeId;
  if (req.auth!.role === "EMPLOYEE") {
    employeeId = req.auth!.employeeId!;
    if (!EMPLOYEE_UPLOAD.includes(data.category)) throw errors.forbidden("You cannot upload this document type");
  } else if (!employeeId) {
    throw errors.validation("Choose an employee");
  }

  const saved = await storeBuffer({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    kind: "document",
    uploadedById: req.auth!.userId,
    ownerType: "DOCUMENT",
    relatedId: employeeId,
    employeeId,
  });
  const doc = await prisma.document.create({
    data: { employeeId: employeeId!, category: data.category, title: data.title, fileId: saved.id },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: doc.id,
    ip: clientIp(req),
  });
  if (req.auth!.role === "ADMIN") {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (employee) {
      await notify({
        userId: employee.userId,
        type: "DOCUMENT",
        title: "New document uploaded",
        body: data.title,
        href: "/documents",
      });
    }
  }
  return doc;
}

export async function employeeDocuments(employeeId: string) {
  return prisma.document.findMany({
    where: { employeeId },
    include: { file: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function adminDocuments(opts: { q?: string; employeeId?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const where = {
    AND: [
      opts.employeeId ? { employeeId: opts.employeeId } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" as const } },
              { employee: { fullName: { contains: opts.q, mode: "insensitive" as const } } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { file: true, employee: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function downloadDocument(auth: AuthContext, id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: { file: true } });
  if (!doc) throw errors.notFound("Document not found");
  if (auth.role !== "ADMIN" && doc.employeeId !== auth.employeeId) throw errors.forbidden();
  return downloadFile(auth, doc.fileId);
}
