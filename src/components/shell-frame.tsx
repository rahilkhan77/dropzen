"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { adminNav, employeeNav, kycNav, type NavItem } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";

type UserInfo = {
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  photoUrl?: string | null;
  employeeCode?: string | null;
  kycStatus?: string | null;
};

function NavLinks({ items, pathname, unread, onClick }: { items: NavItem[]; pathname: string; unread: number; onClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.href === "/notifications" && unread > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function ShellFrame({
  user,
  unread,
  companyName = "DropZen",
  companyLogoUrl,
  children,
}: {
  user: UserInfo;
  unread: number;
  companyName?: string;
  companyLogoUrl?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items =
    user.role === "ADMIN"
      ? adminNav
      : user.kycStatus === "APPROVED"
        ? employeeNav
        : kycNav;
  const mobileMain = items.slice(0, 4);

  return (
    <div className="flex min-h-full bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <BrandMark light name={companyName} logoUrl={companyLogoUrl} className="mb-8 px-1" />
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={items} pathname={pathname} unread={unread} />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet>
              <SheetTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="bg-sidebar text-sidebar-foreground">
                <SheetHeader>
                  <SheetTitle>
                    <BrandMark light name={companyName} logoUrl={companyLogoUrl} />
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 px-2">
                  <NavLinks items={items} pathname={pathname} unread={unread} />
                </div>
              </SheetContent>
            </Sheet>
            <BrandMark name={companyName} logoUrl={companyLogoUrl} />
          </div>
          <p className="hidden text-sm text-muted-foreground md:block">
            {user.role === "ADMIN" ? "Admin workspace" : user.employeeCode ?? "Employee workspace"}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/notifications" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}>
              <Bell className="size-4" />
              {unread > 0 ? (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
              ) : null}
            </Link>
            <div className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1">
              <Avatar size="sm">
                {user.photoUrl ? <AvatarImage src={user.photoUrl} alt={user.name} /> : null}
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-medium">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">{user.role === "ADMIN" ? "Admin" : "Employee"}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 px-1 py-2 backdrop-blur md:hidden">
          {mobileMain.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-1 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          <Link
            href={user.role === "ADMIN" ? "/admin/settings" : "/profile"}
            className="flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] text-muted-foreground"
          >
            <Menu className="size-4" />
            More
          </Link>
        </nav>
      </div>
    </div>
  );
}
