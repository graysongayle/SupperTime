"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  Inbox,
  Settings,
  UserCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/tickets", icon: Inbox, label: "Inbox" },
  { href: "/tickets?view=mine", icon: UserCheck, label: "Assigned to me" },
  { href: "/tickets?view=unassigned", icon: UserRoundX, label: "Unassigned" },
  { href: "/tickets?status=PENDING", icon: Clock3, label: "Waiting on other" },
  { href: "/tickets?priority=URGENT", icon: Flame, label: "Urgent" },
  { href: "/tickets?status=RESOLVED", icon: CheckCircle2, label: "Resolved" },
  { href: "/customers", icon: UsersRound, label: "Customers" },
];

export function AppNav({
  canManageSupportForms = false,
  collapsed = false,
  isSuperAdmin,
}: {
  canManageSupportForms?: boolean;
  collapsed?: boolean;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = `${pathname}${
    searchParams.size > 0 ? `?${searchParams.toString()}` : ""
  }`;

  return (
    <nav className="space-y-1 p-3">
      {[
        ...primaryItems,
        ...(canManageSupportForms
          ? [{ href: "/support-forms", icon: Code2, label: "Support forms" }]
          : []),
      ].map((item) => {
        const isInbox =
          item.href === "/tickets" &&
          pathname.startsWith("/tickets") &&
          (pathname !== "/tickets" || searchParams.size === 0);
        const isCustomers =
          item.href === "/customers" && pathname.startsWith("/customers");
        const isSupportForms =
          item.href === "/support-forms" &&
          pathname.startsWith("/support-forms");
        const isActive =
          currentPath === item.href || isInbox || isCustomers || isSupportForms;
        const Icon = item.icon;

        return (
          <Button
            key={item.href}
            variant={isActive ? "secondary" : "ghost"}
            size={collapsed ? "icon" : "default"}
            className={cn("h-9 w-full", collapsed ? "justify-center" : "justify-start")}
            title={collapsed ? item.label : undefined}
            asChild
          >
            <Link href={item.href}>
              <Icon className="size-4 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          </Button>
        );
      })}
      {isSuperAdmin ? (
        <>
          <Button
            variant={pathname === "/admin/users" ? "secondary" : "ghost"}
            size={collapsed ? "icon" : "default"}
            className={cn("h-9 w-full", collapsed ? "justify-center" : "justify-start")}
            title={collapsed ? "Users" : undefined}
            asChild
          >
            <Link href="/admin/users">
              <UsersRound className="size-4 shrink-0" />
              {!collapsed ? <span>Users</span> : null}
            </Link>
          </Button>
          <Button
            variant={pathname === "/admin/maintenance" ? "secondary" : "ghost"}
            size={collapsed ? "icon" : "default"}
            className={cn("h-9 w-full", collapsed ? "justify-center" : "justify-start")}
            title={collapsed ? "Maintenance" : undefined}
            asChild
          >
            <Link href="/admin/maintenance">
              <Settings className="size-4 shrink-0" />
              {!collapsed ? <span>Maintenance</span> : null}
            </Link>
          </Button>
        </>
      ) : null}
    </nav>
  );
}
