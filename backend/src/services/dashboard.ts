import { prisma } from "../config/db.js";
import { getSettings } from "./settings.js";
import { dateKeyInTz, monthKey, yearMonthParts, workingDayCount } from "../utils/dates.js";
import { errors } from "../utils/errors.js";

export async function employeeDashboard(userId: string, employeeId: string) {
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  const { year, month } = yearMonthParts(monthKey(new Date(), settings.timezone));
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true, bankDetails: true },
  });
  if (!employee) throw errors.notFound("Employee not found");

  const [attendance, monthAttendance, assignments, announcements, salary, unread, balances] = await Promise.all([
    prisma.attendance.findUnique({
      where: { employeeId_dateKey: { employeeId, dateKey: today } },
    }),
    prisma.attendance.findMany({
      where: { employeeId, dateKey: { startsWith: `${year}-${String(month).padStart(2, "0")}` } },
    }),
    prisma.taskAssignment.findMany({
      where: { employeeId },
      include: { task: true, submissions: true },
      orderBy: { task: { deadline: "asc" } },
    }),
    prisma.announcement.findMany({
      where: { publishDate: { lte: today }, active: true },
      orderBy: { publishDate: "desc" },
      take: 3,
    }),
    prisma.salaryRecord.findFirst({
      where: { employeeId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.leaveBalance.findMany({ where: { employeeId, year }, include: { leaveType: true } }),
  ]);

  const todayTasks = assignments.filter((a) => a.task.dateKey === today);
  const pending = assignments.filter((a) => !["COMPLETED", "APPROVED"].includes(a.status));
  const overdue = assignments.filter((a) => a.status === "OVERDUE");
  const submitted = assignments.filter((a) => ["SUBMITTED", "UNDER_REVIEW"].includes(a.status));

  return {
    settings,
    today,
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.user.email,
      phone: employee.phone,
      department: employee.department,
      designation: employee.designation,
      photoFileId: employee.photoFileId,
      joiningDate: employee.joiningDate,
      address: employee.address,
      emergencyName: employee.emergencyName,
      emergencyPhone: employee.emergencyPhone,
      dateOfBirth: employee.dateOfBirth,
      skills: employee.skills,
      bankStatus: employee.bankDetails?.status ?? null,
      kycStatus: employee.kycStatus,
    },
    attendance,
    monthAttendance,
    assignments,
    todayTasks,
    pendingTasks: pending,
    overdueTasks: overdue,
    submissionStatus: submitted.map((a) => ({
      taskId: a.taskId,
      title: a.task.title,
      status: a.status,
    })),
    leaveBalance: balances,
    salary: salary ? { ...salary, amount: salary.netSalary } : null,
    unread,
    announcements,
    workingDaysThisMonth: workingDayCount(year, month, settings.workingDays),
  };
}

export async function adminDashboard() {
  const settings = await getSettings();
  const today = dateKeyInTz(new Date(), settings.timezone);
  const [employees, present, tasks, pendingLeave, pendingPay, review, pendingKyc] = await Promise.all([
    prisma.employee.findMany({ include: { user: { select: { status: true } } } }),
    prisma.attendance.findMany({ where: { dateKey: today, status: { in: ["PRESENT", "LATE", "HALF_DAY"] } } }),
    prisma.taskAssignment.findMany({ include: { task: true } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.salaryRecord.count({ where: { status: "PENDING" } }),
    prisma.taskAssignment.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.employee.count({ where: { kycStatus: "PENDING_VERIFICATION" } }),
  ]);
  const active = employees.filter((e) => e.user.status === "ACTIVE").length;
  const overdue = tasks.filter((t) => t.status === "OVERDUE").length;
  const pendingTasks = tasks.filter((t) =>
    ["ASSIGNED", "IN_PROGRESS", "REVISION_REQUIRED", "OVERDUE"].includes(t.status),
  ).length;
  const completed = tasks.filter((t) => ["COMPLETED", "APPROVED"].includes(t.status)).length;
  const absent = Math.max(active - present.length, 0);
  return {
    settings,
    today,
    employees: employees.length,
    active,
    presentToday: present.length,
    absent,
    pendingTasks,
    overdue,
    awaitingReview: review,
    pendingLeaves: pendingLeave,
    pendingPayroll: pendingPay,
    pendingKyc,
    completionPct: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}
