"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailPlus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useHelpCenterSelection } from "@/components/app/help-center-selection";

const routeTitles = [
  {
    match: (pathname: string) => pathname === "/tickets/new",
    title: "Create ticket",
    subtitle: "Manual support intake",
  },
  {
    match: (pathname: string) => pathname.startsWith("/tickets/"),
    title: "Ticket detail",
    subtitle: "Conversation and ticket properties",
  },
  {
    match: (pathname: string) => pathname === "/admin/users",
    title: "Users",
    subtitle: "Role and access management",
  },
  {
    match: (pathname: string) => pathname === "/customers",
    title: "Customers",
    subtitle: "Customer directory and ticket history",
  },
  {
    match: (pathname: string) => pathname.startsWith("/customers/"),
    title: "Customer detail",
    subtitle: "Related tickets and contact history",
  },
  {
    match: (pathname: string) => pathname === "/support-forms",
    title: "Support forms",
    subtitle: "Embedded customer intake",
  },
];

function getRouteTitle(pathname: string) {
  return (
    routeTitles.find((item) => item.match(pathname)) ?? {
      title: "Suppertime",
      subtitle: "Internal support",
    }
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const isTicketList = pathname === "/tickets";
  const isNewTicket = pathname === "/tickets/new";
  const isHelpCenter = pathname.startsWith("/help-center");
  const routeTitle = getRouteTitle(pathname);
  const helpCenterSelection = useHelpCenterSelection();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-2" />
      {isHelpCenter ? (
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="text-sm">
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/help-center">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/help-center">
                  {helpCenterSelection.selection.section.title}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {helpCenterSelection.selection.article.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : isTicketList ? (
        <form action="/tickets" className="relative min-w-0 flex-1">
          <input type="hidden" name="includeClosed" value="true" />
          <input type="hidden" name="prefs" value="off" />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search tickets"
            name="q"
            className="h-9 max-w-xl border-zinc-200 bg-zinc-50 pl-8"
            placeholder="Search all tickets"
          />
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-950">
            {routeTitle.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {routeTitle.subtitle}
          </div>
        </div>
      )}

      {!isNewTicket ? (
        <Button asChild className="bg-zinc-900 text-white hover:bg-zinc-800">
          <Link href="/tickets/new">
            <MailPlus className="size-4" />
            New ticket
          </Link>
        </Button>
      ) : null}
    </header>
  );
}
