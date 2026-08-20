/**
 * Removes known development/demo business records.
 * Does not drop schema. Does not delete the admin user.
 * Does not delete employees unless they match known demo emails/usernames.
 */
import path from "path";
import { readFileSync, existsSync } from "fs";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const rootEnv = path.join(process.cwd(), "..", ".env");
  for (const candidate of [envPath, rootEnv]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const prisma = new PrismaClient();

const DEMO_EMAILS = [
  "priya.sharma@dropzen.com",
  "rahul.mehta@dropzen.com",
  "ananya.iyer@dropzen.com",
];

const DEMO_USERNAMES = ["priya", "rahul", "ananya"];

const DEMO_TASK_TITLES = [
  "Daily lead enrichment — marketplace sellers",
  "Vendor master cleanup",
  "SKU attribute mapping",
  "Inbound ticket categorisation",
  "QA excel task",
  "E2E Excel enrichment",
];

const DEMO_ANNOUNCEMENTS = [
  "Independence Day work calendar",
  "Submit bank details for August payroll",
];

async function main() {
  const demoUsers = await prisma.user.findMany({
    where: {
      role: "EMPLOYEE",
      OR: [
        { email: { in: DEMO_EMAILS } },
        { username: { in: DEMO_USERNAMES } },
        { email: { startsWith: "qa." } },
        { email: { startsWith: "e2e." } },
      ],
    },
    include: { employee: true },
  });

  const employeeIds = demoUsers.map((u) => u.employee?.id).filter(Boolean) as string[];
  const userIds = demoUsers.map((u) => u.id);

  if (employeeIds.length) {
    await prisma.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: { photoFileId: null, kycReviewedById: null },
    });
    await prisma.submissionVersion.deleteMany({
      where: { submission: { assignment: { employeeId: { in: employeeIds } } } },
    });
    await prisma.taskSubmission.deleteMany({ where: { assignment: { employeeId: { in: employeeIds } } } });
    await prisma.taskAssignment.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.attendanceCorrection.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.attendance.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.salaryRecord.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.document.deleteMany({ where: { employeeId: { in: employeeIds } } });
    await prisma.bankDetails.deleteMany({ where: { employeeId: { in: employeeIds } } });
  }

  if (userIds.length) {
    await prisma.taskFile.deleteMany({
      where: {
        file: {
          OR: [{ uploadedById: { in: userIds } }, ...(employeeIds.length ? [{ employeeId: { in: employeeIds } }] : [])],
        },
      },
    });
    await prisma.fileAsset.deleteMany({
      where: {
        OR: [{ uploadedById: { in: userIds } }, ...(employeeIds.length ? [{ employeeId: { in: employeeIds } }] : [])],
      },
    });
  }

  if (employeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  }

  if (userIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.updateMany({ where: { actorId: { in: userIds } }, data: { actorId: null } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.task.deleteMany({ where: { title: { in: DEMO_TASK_TITLES } } });
  await prisma.announcement.deleteMany({ where: { title: { in: DEMO_ANNOUNCEMENTS } } });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { body: { contains: "Priya Sharma" } },
        { body: { contains: "Rahul Mehta" } },
        { body: { contains: "Ananya Iyer" } },
        { title: { contains: "Priya Sharma" } },
      ],
    },
  });

  const leftoverTasks = await prisma.task.findMany({ include: { assignments: true } });
  const emptyIds = leftoverTasks.filter((t) => t.assignments.length === 0).map((t) => t.id);
  if (emptyIds.length) {
    await prisma.taskFile.deleteMany({ where: { taskId: { in: emptyIds } } });
    await prisma.task.deleteMany({ where: { id: { in: emptyIds } } });
  }

  console.log(`Removed ${demoUsers.length} demo employee account(s) and related business records.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
