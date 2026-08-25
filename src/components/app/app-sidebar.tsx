"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  Clock3,
  Code2,
  FileText,
  Inbox,
  LifeBuoy,
  List,
  Settings,
  Ticket,
  UserRound,
  UsersRound,
} from "lucide-react"
import { UserButton } from "@clerk/nextjs"

import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

type SidebarCount = {
  allTickets: number
  activeTickets: number
  assignedToMe: number
  unassigned: number
  waiting: number
  urgent: number
}

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  canManageSupportForms: boolean
  counts: SidebarCount
  initials: string
  isSuperAdmin: boolean
  roleLabel: string
  userEmail: string
  userName: string
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function isTicketsRoot(pathname: string, search: string) {
  return pathname.startsWith("/tickets") && search === ""
}

function isActiveHref(pathname: string, search: string, href: string) {
  if (href === "/tickets") {
    return isTicketsRoot(pathname, search)
  }

  const current = `${pathname}${search ? `?${search}` : ""}`
  return current === href
}

const waitingStatusesHref =
  "/tickets?status=PENDING,WAITING_ON_CUSTOMER,WAITING_ON_THIRD_PARTY"
const activeTicketsHref =
  "/tickets?status=OPEN,PENDING,WAITING_ON_CUSTOMER,WAITING_ON_THIRD_PARTY"
const allTicketsHref =
  "/tickets?sort=last_customer_desc&prefs=off&includeClosed=true"
const urgentTicketsHref =
  "/tickets?priority=URGENT&status=OPEN,PENDING,WAITING_ON_CUSTOMER,WAITING_ON_THIRD_PARTY"

function SidebarNavButton({
  href,
  icon: Icon,
  title,
  badge,
  active,
  onNavigate,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  badge?: number
  active: boolean
  onNavigate: () => void
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={title}>
        <Link href={href} onClick={onNavigate}>
          <Icon />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
      {typeof badge === "number" && badge > 0 ? (
        <SidebarMenuBadge>{formatCount(badge)}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  canManageSupportForms,
  counts,
  initials,
  isSuperAdmin,
  roleLabel,
  userEmail,
  userName,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const { setOpenMobile } = useSidebar()

  function closeMobileSidebar() {
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/tickets" onClick={closeMobileSidebar}>
                <span className="flex size-8 items-center justify-center rounded-md bg-zinc-900 text-white shadow-sm">
                  <Inbox className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold leading-tight">
                    Suppertime
                  </span>
                  <span className="text-xs text-sidebar-foreground/70">
                    Internal support
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Queues</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavButton
                href={activeTicketsHref}
                icon={Inbox}
                title="Active tickets"
                badge={counts.activeTickets}
                active={isActiveHref(pathname, search, activeTicketsHref)}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href="/tickets?view=mine"
                icon={UserRound}
                title="Assigned to me"
                badge={counts.assignedToMe}
                active={isActiveHref(pathname, search, "/tickets?view=mine")}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href="/tickets?view=unassigned"
                icon={Ticket}
                title="Unassigned"
                badge={counts.unassigned}
                active={isActiveHref(
                  pathname,
                  search,
                  "/tickets?view=unassigned",
                )}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href={urgentTicketsHref}
                icon={AlertTriangle}
                title="Urgent"
                badge={counts.urgent}
                active={isActiveHref(pathname, search, urgentTicketsHref)}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href={waitingStatusesHref}
                icon={Clock3}
                title="Waiting on others"
                badge={counts.waiting}
                active={isActiveHref(pathname, search, waitingStatusesHref)}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href={allTicketsHref}
                icon={List}
                title="All tickets"
                badge={counts.allTickets}
                active={isActiveHref(pathname, search, allTicketsHref)}
                onNavigate={closeMobileSidebar}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Records</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavButton
                href="/tickets/templates"
                icon={FileText}
                title="Templates"
                active={pathname === "/tickets/templates"}
                onNavigate={closeMobileSidebar}
              />
              <SidebarNavButton
                href="/customers"
                icon={UsersRound}
                title="Customers"
                active={pathname.startsWith("/customers")}
                onNavigate={closeMobileSidebar}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {canManageSupportForms ? (
                <SidebarNavButton
                  href="/support-forms"
                  icon={Code2}
                  title="Support forms"
                  active={pathname.startsWith("/support-forms")}
                  onNavigate={closeMobileSidebar}
                />
              ) : null}
              {isSuperAdmin ? (
                <>
                  <SidebarNavButton
                    href="/admin/users"
                    icon={UsersRound}
                    title="Users"
                    active={pathname.startsWith("/admin/users")}
                    onNavigate={closeMobileSidebar}
                  />
                  <SidebarNavButton
                    href="/admin/maintenance"
                    icon={Settings}
                    title="Maintenance"
                    active={pathname.startsWith("/admin/maintenance")}
                    onNavigate={closeMobileSidebar}
                  />
                </>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Help</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavButton
                href="/help-center"
                icon={LifeBuoy}
                title="Help center"
                active={pathname.startsWith("/help-center")}
                onNavigate={closeMobileSidebar}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{userName}</div>
              <div className="truncate text-xs text-sidebar-foreground/70">
                {userEmail}
              </div>
            </div>
            <UserButton />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="border-sidebar-border bg-sidebar text-[11px] text-sidebar-foreground"
            >
              {roleLabel}
            </Badge>
            <span className="text-xs text-sidebar-foreground/60">Live</span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
