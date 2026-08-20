import { prisma } from "../src/config/db.js";

const employee = await prisma.employee.findFirst({
  where: {
    user: { email: { startsWith: "live.", not: { contains: "b@" } } },
    kycStatus: "APPROVED",
    salaryRecords: { some: {} },
    assignments: { some: {} },
    attendance: { some: {} },
  },
  include: {
    user: { select: { email: true } },
    salaryRecords: true,
    assignments: { include: { task: true } },
    attendance: true,
    leaveRequests: true,
  },
  orderBy: { createdAt: "desc" },
});

if (!employee) {
  console.error("No live QA employee with salary/task/attendance found");
  process.exit(1);
}

const checks = {
  email: employee.user.email,
  kyc: employee.kycStatus,
  salary: employee.salaryRecords.map((r) => ({ month: r.month, status: r.status, net: r.netPay })),
  tasks: employee.assignments.map((a) => ({ title: a.task.title, status: a.status })),
  attendance: employee.attendance.map((a) => ({ date: a.dateKey, status: a.status })),
  leave: employee.leaveRequests.map((r) => ({ status: r.status })),
};
console.log(JSON.stringify(checks, null, 2));
if (employee.kycStatus !== "APPROVED") process.exit(1);
await prisma.$disconnect();
