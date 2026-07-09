import { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { UserButton } from "@clerk/nextjs";

import { AppContentShell } from "@/components/app/app-content-shell";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { HelpCenterSelectionProvider } from "@/components/app/help-center-selection";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TicketPriority, TicketStatus, UserRole } from "@/generated/prisma/enums";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
  GUEST: "Guest",
};

const roleStyles: Record<string, string> = {
  SUPER_ADMIN: "border-indigo-200 bg-indigo-50 text-indigo-800",
  MANAGER: "border-cyan-200 bg-cyan-50 text-cyan-800",
  AGENT: "border-zinc-200 bg-zinc-50 text-zinc-700",
  GUEST: "border-amber-200 bg-amber-50 text-amber-800",
};

function getInitials(name: string, email: string) {
  const source = name !== "Guest" ? name : email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const appUser = await getCurrentAppUser();
  const viewer = appUser
    ? {
        appRole: appUser.role,
        clerkId: appUser.clerkId,
        email: appUser.email,
        isActive: appUser.isActive,
        name: appUser.name ?? appUser.email,
      }
    : {
        appRole: null,
        clerkId: null,
        email: "Not signed in",
        isActive: null,
        name: "Guest",
      };
  const roleLabel = viewer.appRole
    ? roleLabels[viewer.appRole] ?? viewer.appRole
    : "Not provisioned";
  const initials = getInitials(viewer.name, viewer.email) || "U";
  const canManageSupportForms =
    viewer.appRole === UserRole.SUPER_ADMIN ||
    viewer.appRole === UserRole.MANAGER;

  if (viewer.appRole === UserRole.GUEST || !viewer.appRole) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-4">
        <Card className="w-full max-w-lg rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
                <UserRound className="size-5" />
              </span>
              Account pending access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <div className="font-medium">{viewer.name}</div>
              <div className="text-sm text-muted-foreground">{viewer.email}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-muted-foreground">
              Your account has been created, but it has guest access only. A
              super-admin must assign you an app role before you can view or
              manage support tickets.
            </div>
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className={roleStyles.GUEST}>
                {roleLabel}
              </Badge>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Account settings
                </span>
                <UserButton />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const [
    inboxCount,
    assignedToMeCount,
    unassignedCount,
    pendingCount,
    urgentCount,
    resolvedCount,
  ] = await Promise.all([
    prisma.ticket.count({
      where: {
        status: TicketStatus.OPEN,
      },
    }),
    prisma.ticket.count({
      where: {
        assignedToId: appUser?.id ?? "",
      },
    }),
    prisma.ticket.count({
      where: {
        assignedToId: null,
        status: {
          notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
        },
      },
    }),
    prisma.ticket.count({
      where: {
        status: TicketStatus.PENDING,
      },
    }),
    prisma.ticket.count({
      where: {
        priority: TicketPriority.URGENT,
        status: {
          not: TicketStatus.CLOSED,
        },
      },
    }),
    prisma.ticket.count({
      where: {
        status: TicketStatus.RESOLVED,
      },
    }),
  ]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <HelpCenterSelectionProvider>
          <AppSidebar
            canManageSupportForms={canManageSupportForms}
            counts={{
              inbox: inboxCount,
              assignedToMe: assignedToMeCount,
              unassigned: unassignedCount,
              pending: pendingCount,
              urgent: urgentCount,
              resolved: resolvedCount,
            }}
            initials={initials}
            isSuperAdmin={viewer.appRole === UserRole.SUPER_ADMIN}
            roleLabel={roleLabel}
            userEmail={viewer.email}
            userName={viewer.name}
          />
          <SidebarInset className="min-h-screen bg-[#f6f7f9]">
            <AppHeader />

            <AppContentShell>{children}</AppContentShell>
          </SidebarInset>
        </HelpCenterSelectionProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
