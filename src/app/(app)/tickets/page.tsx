import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  Inbox,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketBulkTable } from "@/components/app/ticket-bulk-table";
import { TicketFilters } from "@/components/app/ticket-filters";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prisma } from "@/generated/prisma/client";
import {
  TicketPriority,
  TicketStatus,
  UserRole,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const statusLabels: Record<TicketStatusValue, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

const priorityLabels: Record<TicketPriorityValue, string> = {
  [TicketPriority.URGENT]: "Urgent",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.LOW]: "Low",
};

const validStatuses = new Set<TicketStatusValue>(Object.values(TicketStatus));
const validPriorities = new Set<TicketPriorityValue>(
  Object.values(TicketPriority),
);

type TicketSearchParams = {
  q?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  view?: string;
  includeClosed?: string;
  page?: string;
};

const pageSize = 25;

function normalizeEnumValue<T extends string>(value: string | undefined) {
  return value?.trim().toUpperCase() as T | undefined;
}

function buildHref(
  current: TicketSearchParams,
  patch: Partial<TicketSearchParams>,
) {
  const params = new URLSearchParams();
  const merged = {
    q: current.q,
    status: current.status,
    priority: current.priority,
    assignee: current.assignee,
    view: current.view,
    includeClosed: current.includeClosed,
    page: current.page,
    ...patch,
  };

  Object.entries(merged).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

function buildTicketWhere({
  assignee,
  currentUserId,
  priority,
  q,
  status,
  view,
  includeClosed,
}: {
  assignee: string | null;
  currentUserId: string | null;
  includeClosed: boolean;
  priority: TicketPriorityValue | null;
  q: string | null;
  status: TicketStatusValue | null;
  view: string | null;
}) {
  const clauses: Prisma.TicketWhereInput[] = [];

  if (status) {
    clauses.push({ status });
  } else if (!includeClosed) {
    clauses.push({ status: { not: TicketStatus.CLOSED } });
  }

  if (priority) {
    clauses.push({ priority });
  }

  if (view === "mine" && currentUserId) {
    clauses.push({ assignedToId: currentUserId });
  } else if (view === "unassigned") {
    clauses.push({ assignedToId: null });
  } else if (assignee) {
    clauses.push({ assignedToId: assignee });
  }

  if (q) {
    const maybeNumber = Number(q.replace(/^#/, ""));
    const searchClauses: Prisma.TicketWhereInput[] = [
      { subject: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
    ];

    if (Number.isInteger(maybeNumber)) {
      searchClauses.unshift({ number: maybeNumber });
    }

    clauses.push({ OR: searchClauses });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

async function getDashboardData(searchParams: TicketSearchParams) {
  const currentUser = await getCurrentAppUser();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const rawStatus = normalizeEnumValue<TicketStatusValue>(searchParams.status);
  const rawPriority = normalizeEnumValue<TicketPriorityValue>(
    searchParams.priority,
  );
  const status = rawStatus && validStatuses.has(rawStatus) ? rawStatus : null;
  const priority =
    rawPriority && validPriorities.has(rawPriority) ? rawPriority : null;
  const q = searchParams.q?.trim() || null;
  const view = searchParams.view?.trim() || null;
  const assignee = searchParams.assignee?.trim() || null;
  const includeClosed = searchParams.includeClosed === "true";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const baseForCounts = buildTicketWhere({
    assignee,
    currentUserId: currentUser?.id ?? null,
    includeClosed,
    priority,
    q,
    status: null,
    view,
  });
  const where = buildTicketWhere({
    assignee,
    currentUserId: currentUser?.id ?? null,
    includeClosed,
    priority,
    q,
    status,
    view,
  });

  const [
    tickets,
    totalTickets,
    agents,
    openCount,
    pendingCount,
    waitingCount,
    resolvedTodayCount,
  ] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
      include: {
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            attachments: true,
          },
        },
      },
    }),
    prisma.ticket.count({
      where,
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.AGENT],
        },
      },
      orderBy: {
        email: "asc",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [baseForCounts, { status: TicketStatus.OPEN }],
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [baseForCounts, { status: TicketStatus.PENDING }],
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [
          baseForCounts,
          {
            status: {
              in: [
                TicketStatus.WAITING_ON_CUSTOMER,
                TicketStatus.WAITING_ON_THIRD_PARTY,
              ],
            },
          },
        ],
      },
    }),
    prisma.ticket.count({
      where: {
        AND: [
          baseForCounts,
          {
            status: TicketStatus.RESOLVED,
            resolvedAt: {
              gte: startOfToday,
            },
          },
        ],
      },
    }),
  ]);

  return {
    active: {
      assignee,
      includeClosed,
      page,
      priority,
      q,
      status,
      view,
    },
    agents,
    canBulkDelete: currentUser?.role === UserRole.SUPER_ADMIN,
    canBulkUpdateStatus:
      currentUser?.role === UserRole.SUPER_ADMIN ||
      currentUser?.role === UserRole.MANAGER ||
      currentUser?.role === UserRole.AGENT,
    summary: [
      ["Open", openCount, Inbox],
      ["Waiting on other", pendingCount, Clock3],
      ["Waiting", waitingCount, UserRound],
      ["Resolved today", resolvedTodayCount, CheckCircle2],
    ] as const,
    tickets,
    pagination: {
      currentPage: page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalTickets / pageSize)),
      totalTickets,
    },
  };
}

function getPageHeading(active: {
  assignee: string | null;
  includeClosed: boolean;
  page: number;
  priority: TicketPriorityValue | null;
  q: string | null;
  status: TicketStatusValue | null;
  view: string | null;
}) {
  if (active.q) {
    return {
      badge: "Search results",
      title: `Search: ${active.q}`,
      description: "Tickets matching the current search and filters.",
    };
  }

  if (active.view === "mine") {
    return {
      badge: "My queue",
      title: "Assigned to me",
      description: "Tickets currently assigned to your account.",
    };
  }

  if (active.view === "unassigned") {
    return {
      badge: "Queue",
      title: "Unassigned tickets",
      description: "Tickets that need an owner.",
    };
  }

  if (active.priority === TicketPriority.URGENT) {
    return {
      badge: "Priority queue",
      title: "Urgent tickets",
      description: "High-attention tickets across the support queue.",
    };
  }

  if (active.status) {
    return {
      badge: "Status queue",
      title: `${statusLabels[active.status]} tickets`,
      description: "Tickets filtered by their current workflow status.",
    };
  }

  if (active.priority) {
    return {
      badge: "Priority queue",
      title: `${priorityLabels[active.priority]} priority tickets`,
      description: "Tickets filtered by priority.",
    };
  }

  if (active.assignee) {
    return {
      badge: "Assigned queue",
      title: "Assigned tickets",
      description: "Tickets filtered by the selected owner.",
    };
  }

  return {
    badge: "Live queue",
    title: "Support inbox",
    description: active.includeClosed
      ? "Triage incoming email and embedded-form requests, including closed tickets."
      : "Triage incoming email and embedded-form requests. Closed tickets are hidden.",
  };
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<TicketSearchParams>;
}) {
  const params = await searchParams;
  const dashboard = await getDashboardData(params);
  const activeTab =
    dashboard.active.view === "mine" || dashboard.active.view === "unassigned"
      ? dashboard.active.view
      : "all";
  const hasFilters = Boolean(
    dashboard.active.q ||
      dashboard.active.status ||
      dashboard.active.priority ||
      dashboard.active.assignee ||
      dashboard.active.view ||
      dashboard.active.includeClosed,
  );
  const heading = getPageHeading(dashboard.active);
  const firstTicketNumber =
    dashboard.pagination.totalTickets === 0
      ? 0
      : (dashboard.pagination.currentPage - 1) * dashboard.pagination.pageSize + 1;
  const lastTicketNumber = Math.min(
    dashboard.pagination.currentPage * dashboard.pagination.pageSize,
    dashboard.pagination.totalTickets,
  );
  const previousPageHref = buildHref(params, {
    page:
      dashboard.pagination.currentPage > 2
        ? String(dashboard.pagination.currentPage - 1)
        : undefined,
  });
  const nextPageHref = buildHref(params, {
    page: String(dashboard.pagination.currentPage + 1),
  });

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-cyan-800"
            >
              {heading.badge}
            </Badge>
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
          <h1 className="break-words text-2xl font-semibold tracking-normal text-zinc-950 [overflow-wrap:anywhere]">
            {heading.title}
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {heading.description}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-4">
        {dashboard.summary.map(([label, value, Icon]) => (
          <Card
            key={label}
            className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm"
          >
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center justify-between text-sm">
                {label}
                <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-50 text-cyan-700 ring-1 ring-zinc-200">
                  <Icon className="size-4" />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-zinc-950">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={activeTab} className="min-w-0">
              <TabsList className="max-w-full flex-wrap overflow-visible">
                <TabsTrigger value="all" asChild>
                  <Link
                    href={buildHref(params, {
                      assignee: undefined,
                      page: undefined,
                      view: undefined,
                    })}
                  >
                    All
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="unassigned" asChild>
                  <Link
                    href={buildHref(params, {
                      assignee: undefined,
                      page: undefined,
                      view: "unassigned",
                    })}
                  >
                    Unassigned
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="mine" asChild>
                  <Link
                    href={buildHref(params, {
                      assignee: undefined,
                      page: undefined,
                      view: "mine",
                    })}
                  >
                    Mine
                  </Link>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <TicketFilters
            active={dashboard.active}
            agents={dashboard.agents}
            hasFilters={hasFilters}
          />
        </div>
        <Separator />
        <TicketBulkTable
          activeStatus={dashboard.active.status}
          canBulkDelete={dashboard.canBulkDelete}
          canBulkUpdateStatus={dashboard.canBulkUpdateStatus}
          hasFilters={hasFilters}
          includeClosed={dashboard.active.includeClosed}
          tickets={dashboard.tickets}
        />
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-3 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            {dashboard.pagination.totalTickets > 0
              ? `Showing ${firstTicketNumber}-${lastTicketNumber} of ${dashboard.pagination.totalTickets}`
              : "No tickets to show"}
          </div>
          <div className="flex items-center gap-2">
            {dashboard.pagination.currentPage > 1 ? (
              <Button asChild variant="outline" size="sm" className="bg-white">
                <Link href={previousPageHref}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            )}
            <span className="min-w-20 text-center text-xs">
              Page {dashboard.pagination.currentPage} of{" "}
              {dashboard.pagination.totalPages}
            </span>
            {dashboard.pagination.currentPage < dashboard.pagination.totalPages ? (
              <Button asChild variant="outline" size="sm" className="bg-white">
                <Link href={nextPageHref}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
