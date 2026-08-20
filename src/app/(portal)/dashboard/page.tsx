import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  ClipboardList,
  Landmark,
  Upload,
  UserRound,
  Wallet,
  Users,
  AlertTriangle,
} from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { apiGet } from "@/lib/backend";
import { formatLongDate } from "@/lib/dates";
import { profileCompletion } from "@/lib/profile";
import { formatInr } from "@/lib/utils";
import { getCompanyName } from "@/lib/company";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { markAttendanceAction, checkoutAttendanceAction } from "@/server/actions/attendance";
import { ActionForm } from "@/components/action-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") return <AdminDashboard />;
  if (user.kycStatus !== "APPROVED") redirect("/employee/kyc");
  return <EmployeeDashboard />;
}

type EmpDash = {
  today: string;
  employee: {
    fullName: string;
    photoFileId: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    address: string | null;
    emergencyName: string | null;
    emergencyPhone: string | null;
    joiningDate: string;
    employeeCode: string;
    department: string | null;
    designation: string | null;
    skills: string;
    email: string;
    bankStatus: string | null;
    kycStatus: string;
  };
  attendance: { status: string; checkInAt: string | null; checkOutAt: string | null } | null;
  monthAttendance: { status: string }[];
  todayTasks: { id: string; status: string; task: { id: string; title: string; deadline: string } }[];
  pendingTasks: unknown[];
  overdueTasks: { id: string }[];
  assignments: { status: string }[];
  announcements: { id: string; title: string; message: string; priority: string }[];
  salary: { amount: number; status: string } | null;
  unread: number;
  workingDaysThisMonth: number;
  leaveBalance: { allocated: number; used: number; leaveType: { name: string } }[];
};

async function EmployeeDashboard() {
  const data = await apiGet<EmpDash>("/api/employee/dashboard");
  const { employee, attendance, today, todayTasks, pendingTasks, overdueTasks, announcements, salary, unread, monthAttendance, workingDaysThisMonth, assignments, leaveBalance } = data;
  const completed = assignments.filter((a) => ["COMPLETED", "APPROVED"].includes(a.status));
  const present = monthAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE" || a.status === "HALF_DAY").length;
  const completion = profileCompletion({
    fullName: employee.fullName,
    photoFileId: employee.photoFileId,
    phone: employee.phone,
    dateOfBirth: employee.dateOfBirth,
    address: employee.address,
    emergencyName: employee.emergencyName,
    emergencyPhone: employee.emergencyPhone,
    joiningDate: employee.joiningDate,
    employeeCode: employee.employeeCode,
    department: employee.department,
    designation: employee.designation,
    skills: employee.skills,
    user: { email: employee.email },
  });

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${employee.fullName.split(" ")[0]}`}
        description={formatLongDate(today)}
        actions={
          attendance?.checkInAt ? (
            attendance.checkOutAt ? (
              <StatusBadge value={attendance.status} />
            ) : (
              <div className="flex items-center gap-2">
                <StatusBadge value={attendance.status} />
                <ActionForm action={checkoutAttendanceAction}>
                  <Button type="submit">Check out</Button>
                </ActionForm>
              </div>
            )
          ) : (
            <ActionForm action={markAttendanceAction}>
              <Button type="submit">Mark attendance</Button>
            </ActionForm>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's attendance"
          value={attendance?.status.replaceAll("_", " ") ?? "Not marked"}
          icon={CalendarCheck}
          hint={attendance?.checkInAt ? "Checked in" : "Attendance has not been marked today."}
        />
        <StatCard label="Today's tasks" value={todayTasks.length} icon={ClipboardList} hint={todayTasks.length ? `${pendingTasks.length} still open` : "No tasks assigned yet."} />
        <StatCard label="Overdue" value={overdueTasks.length} icon={AlertTriangle} hint={overdueTasks.length ? "Need attention" : "Nothing overdue"} />
        <StatCard
          label="Latest salary"
          value={salary ? formatInr(salary.amount) : "None"}
          icon={Wallet}
          hint={salary ? salary.status : "No salary records available yet."}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today&apos;s assigned tasks</CardTitle>
            <Link href="/tasks" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayTasks.length === 0 ? (
              <EmptyState title="No tasks assigned yet." description="When an administrator assigns Excel work, it will appear here." />
            ) : (
              todayTasks.map((a) => (
                <Link key={a.id} href={`/tasks/${a.task.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/40">
                  <div>
                    <p className="font-medium">{a.task.title}</p>
                    <p className="text-xs text-muted-foreground">Due {new Date(a.task.deadline).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <StatusBadge value={a.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { href: "/attendance", label: "Mark Attendance", icon: CalendarCheck },
                { href: "/tasks", label: "View Tasks", icon: ClipboardList },
                { href: "/tasks", label: "Submit Work", icon: Upload },
                { href: "/salary", label: "View Salary", icon: Wallet },
                { href: "/profile", label: "Profile", icon: UserRound },
                { href: "/bank", label: "Bank Details", icon: Landmark },
              ].map((item) => (
                <Link key={item.label} href={item.href} className="flex flex-col items-start gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                  <item.icon className="size-4 text-primary" />
                  {item.label}
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Profile completion</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={completion} />
              <p className="mt-2 text-sm text-muted-foreground">{completion}% complete</p>
              <p className="mt-2 text-xs">
                Verification: <StatusBadge value={employee.kycStatus} />
              </p>
              <p className="mt-2 text-xs">
                Bank: <StatusBadge value={employee.bankStatus ?? "PENDING"} />
              </p>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {leaveBalance.length === 0 ? (
                  <p>No leave balance records yet.</p>
                ) : (
                  leaveBalance.map((b) => (
                    <p key={b.leaveType.name}>
                      {b.leaveType.name}: {b.allocated - b.used} remaining
                    </p>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {announcements.length === 0 ? (
              <EmptyState title="No announcements" description="Company updates will show here when published." />
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{a.title}</p>
                    <StatusBadge value={a.priority} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Work snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>This month present: {present}/{workingDaysThisMonth}</p>
            <p>Pending / in progress: {pendingTasks.length}</p>
            <p>Overdue: {overdueTasks.length}</p>
            <p>Completed: {completed.length}</p>
            <p>Unread notifications: {unread}</p>
            <Link href="/notifications" className="inline-flex items-center gap-1 text-primary">
              <Bell className="size-4" /> Open notifications
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function AdminDashboard() {
  const [data, companyName] = await Promise.all([
    apiGet<{
      employees: number;
      active: number;
      presentToday: number;
      absent: number;
      pendingTasks: number;
      overdue: number;
      awaitingReview: number;
      pendingLeaves: number;
      pendingPayroll: number;
      pendingKyc: number;
      completionPct: number;
    }>("/api/admin/dashboard"),
    getCompanyName(),
  ]);

  return (
    <div>
      <PageHeader title={`${companyName} operations`} description="Live snapshot of people, attendance, and Excel work." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Employees" value={data.employees} hint={`${data.active} active`} icon={Users} />
        <StatCard label="Present today" value={data.presentToday} hint={`${data.absent} not marked / absent`} icon={CalendarCheck} />
        <StatCard label="Pending tasks" value={data.pendingTasks} hint={`${data.overdue} overdue`} icon={ClipboardList} />
        <StatCard label="Awaiting review" value={data.awaitingReview} icon={AlertTriangle} />
        <StatCard label="Leave requests" value={data.pendingLeaves} icon={CalendarCheck} />
        <StatCard label="Pending salaries" value={data.pendingPayroll} icon={Wallet} />
        <StatCard label="Pending verification" value={data.pendingKyc} icon={AlertTriangle} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Task completion</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={data.completionPct} />
          <p className="mt-2 text-sm text-muted-foreground">{data.completionPct}% of assignments completed</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/admin/employees" className={cn(buttonVariants())}>Add employee</Link>
            <Link href="/admin/verification" className={cn(buttonVariants({ variant: "outline" }))}>Review verification</Link>
            <Link href="/admin/tasks/new" className={cn(buttonVariants({ variant: "outline" }))}>Create task</Link>
            <Link href="/admin/attendance" className={cn(buttonVariants({ variant: "outline" }))}>Attendance</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
