import type { Request } from "express";
import type { AnnouncementPriority } from "@prisma/client";
import { prisma } from "../config/db.js";
import { errors } from "../utils/errors.js";
import { writeAudit } from "./audit.js";
import { notifyMany } from "./notify.js";
import { storeBuffer } from "./storage.js";
import { dateKeyInTz } from "../utils/dates.js";
import { getSettings } from "./settings.js";
import { clientIp } from "../middleware/auth.js";

export async function listAnnouncements(activeOnly = false) {
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  return prisma.announcement.findMany({
    where: activeOnly
      ? { publishDate: { lte: today }, active: true }
      : {},
    include: { attachment: true, author: { select: { email: true, username: true } } },
    orderBy: { publishDate: "desc" },
  });
}

export async function createAnnouncement(
  req: Request,
  data: { title: string; message: string; priority?: AnnouncementPriority; publishDate?: string; active?: boolean },
  attachment?: Express.Multer.File,
) {
  if (!data.title || !data.message) throw errors.validation("Title and message are required");
  const settings = await getSettings();
  const row = await prisma.announcement.create({
    data: {
      title: data.title,
      message: data.message,
      priority: data.priority || "NORMAL",
      publishDate: data.publishDate || dateKeyInTz(new Date(), settings.timezone),
      active: data.active ?? true,
      authorId: req.auth!.userId,
    },
  });
  if (attachment) {
    const file = await storeBuffer({
      buffer: attachment.buffer,
      originalName: attachment.originalname,
      mimeType: attachment.mimetype,
      kind: "document",
      uploadedById: req.auth!.userId,
      ownerType: "ANNOUNCEMENT",
      relatedId: row.id,
    });
    await prisma.announcement.update({ where: { id: row.id }, data: { attachmentId: file.id } });
  }
  const employees = await prisma.user.findMany({ where: { role: "EMPLOYEE", status: "ACTIVE" } });
  await notifyMany(
    employees.map((u) => u.id),
    { type: "ANNOUNCEMENT", title: "New announcement", body: data.title, href: "/dashboard" },
  );
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ANNOUNCEMENT_CREATED",
    entityType: "Announcement",
    entityId: row.id,
    ip: clientIp(req),
  });
  return row;
}

export async function updateAnnouncement(
  req: Request,
  id: string,
  data: { title?: string; message?: string; priority?: AnnouncementPriority; publishDate?: string; active?: boolean },
) {
  const row = await prisma.announcement.findUnique({ where: { id } });
  if (!row) throw errors.notFound("Announcement not found");
  await prisma.announcement.update({
    where: { id },
    data: {
      title: data.title ?? row.title,
      message: data.message ?? row.message,
      priority: data.priority ?? row.priority,
      publishDate: data.publishDate ?? row.publishDate,
      active: data.active ?? row.active,
    },
  });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ANNOUNCEMENT_UPDATED",
    entityType: "Announcement",
    entityId: id,
    ip: clientIp(req),
  });
}

export async function deleteAnnouncement(req: Request, id: string) {
  await prisma.announcement.delete({ where: { id } });
  await writeAudit({
    actorId: req.auth!.userId,
    action: "ANNOUNCEMENT_DELETED",
    entityType: "Announcement",
    entityId: id,
    ip: clientIp(req),
  });
}
