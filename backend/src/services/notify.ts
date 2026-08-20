import { prisma } from "../config/db.js";
import { publishToUser } from "./realtime.js";
import { getSettings } from "./settings.js";

export async function notify(opts: {
  userId: string;
  title: string;
  body: string;
  type: string;
  href?: string;
}) {
  const settings = await getSettings();
  if (!settings.inAppNotifications) return;
  await prisma.notification.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      body: opts.body,
      type: opts.type,
      href: opts.href,
    },
  });
  publishToUser(opts.userId, "notification", { title: opts.title, type: opts.type, href: opts.href });
}

export async function notifyMany(
  userIds: string[],
  payload: Omit<Parameters<typeof notify>[0], "userId">,
) {
  if (!userIds.length) return;
  const settings = await getSettings();
  if (!settings.inAppNotifications) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      href: payload.href,
    })),
  });
  for (const userId of userIds) {
    publishToUser(userId, "notification", { title: payload.title, type: payload.type, href: payload.href });
  }
}
