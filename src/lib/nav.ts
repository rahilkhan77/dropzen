import {
  LayoutDashboard,
  ListTodo,
  CalendarCheck,
  CalendarOff,
  Wallet,
  FolderOpen,
  UserRound,
  Landmark,
  Bell,
  Users,
  ClipboardList,
  Megaphone,
  BarChart3,
  ScrollText,
  Settings,
  BadgeCheck,
  CircleUser,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
};

export const kycNav: NavItem[] = [
  { href: "/employee/kyc", label: "Verification", icon: BadgeCheck },
  { href: "/profile", label: "Account", icon: CircleUser },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export const employeeNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "My Tasks", icon: ListTodo },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/leave", label: "Leave", icon: CalendarOff },
  { href: "/salary", label: "Salary", icon: Wallet },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/bank", label: "Bank Details", icon: Landmark },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export const adminNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/verification", label: "Verification", icon: BadgeCheck },
  { href: "/admin/tasks", label: "Tasks", icon: ClipboardList },
  { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/admin/leave", label: "Leave", icon: CalendarOff },
  { href: "/admin/payroll", label: "Payroll", icon: Wallet },
  { href: "/admin/documents", label: "Documents", icon: FolderOpen },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/notifications", label: "Notifications", icon: Bell },
];
