/**
 * Deletes only explicitly identified QA/test employee accounts.
 * Matching email prefixes: live.  browser.  qa.  e2e.
 * Never deletes admins, company settings, or leave types.
 *
 * Dry run (default):
 *   npm --prefix backend run cleanup:production-test-data
 *
 * Destructive:
 *   npm --prefix backend run cleanup:production-test-data -- --confirm
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
const PREFIXES = ["live.", "browser.", "qa.", "e2e."];

function isTestEmail(email: string) {
  const local = (email.split("@")[0] ?? "").toLowerCase();
  return PREFIXES.some((prefix) => local.startsWith(prefix));
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const candidates = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    include: { employee: true },
  });
  const targets = candidates.filter((user) => isTestEmail(user.email));
  const employeeIds = targets.map((u) => u.employee?.id).filter(Boolean) as string[];
  const userIds = targets.map((u) => u.id);

  const counts = employeeIds.length
    ? {
        assignments: await prisma.taskAssignment.count({ where: { employeeId: { in: employeeIds } } }),
        attendance: await prisma.attendance.count({ where: { employeeId: { in: employeeIds } } }),
        leaveRequests: await prisma.leaveRequest.count({ where: { employeeId: { in: employeeIds } } }),
        leaveBalances: await prisma.leaveBalance.count({ where: { employeeId: { in: employeeIds } } }),
        salaries: await prisma.salaryRecord.count({ where: { employeeId: { in: employeeIds } } }),
        documents: await prisma.document.count({ where: { employeeId: { in: employeeIds } } }),
        sessions: await prisma.session.count({ where: { userId: { in: userIds } } }),
        invitations: await prisma.invitation.count({ where: { userId: { in: userIds } } }),
      }
    : {
        assignments: 0,
        attendance: 0,
        leaveRequests: 0,
        leaveBalances: 0,
        salaries: 0,
        documents: 0,
        sessions: 0,
        invitations: 0,
      };

  console.log(confirm ? "DELETING identified QA/test accounts:" : "DRY RUN — would delete identified QA/test accounts:");
  if (!targets.length) {
    console.log("  (none matched live.*, browser.*, qa.*, or e2e.* employee emails)");
  } else {
    for (const user of targets) {
      console.log(`  - ${user.email} (${user.employee?.employeeCode ?? "no code"}) status=${user.status}`);
    }
  }
  console.log("Dependent records:", counts);
  console.log("Not touched: admin accounts, company settings, leave types, non-matching employees.");

  if (!confirm) {
    console.log("\nRe-run with --confirm to delete:");
    console.log("  npm --prefix backend run cleanup:production-test-data -- --confirm");
    return;
  }

  if (!employeeIds.length) return;

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
  await prisma.taskFile.deleteMany({
    where: {
      file: {
        OR: [{ uploadedById: { in: userIds } }, { employeeId: { in: employeeIds } }],
      },
    },
  });
  await prisma.fileAsset.deleteMany({
    where: {
      OR: [{ uploadedById: { in: userIds } }, { employeeId: { in: employeeIds } }],
    },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.invitation.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.updateMany({ where: { actorId: { in: userIds } }, data: { actorId: null } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const leftoverTasks = await prisma.task.findMany({ include: { assignments: true } });
  const emptyIds = leftoverTasks.filter((t) => t.assignments.length === 0).map((t) => t.id);
  if (emptyIds.length) {
    await prisma.taskFile.deleteMany({ where: { taskId: { in: emptyIds } } });
    await prisma.task.deleteMany({ where: { id: { in: emptyIds } } });
  }

  console.log(`Deleted ${targets.length} QA/test employee account(s) and their dependent records.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
