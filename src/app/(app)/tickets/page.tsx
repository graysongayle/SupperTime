import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketBulkTable } from "@/components/app/ticket-bulk-table";
import {
  TicketFilters,
  TicketSearchControl,
} from "@/components/app/ticket-filters";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prisma } from "@/generated/prisma/client";
import {
  MessageAuthorType,
  MessageVisibility,
  TicketPriority,
  TicketStatus,
  UserRole,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

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
const unassignedAssigneeValue = "unassigned";
const ticketPreferencePageKey = "tickets";
const ticketSorts = [
  "last_customer_desc",
  "last_customer_asc",
  "last_agent_desc",
  "last_agent_asc",
  "updated_desc",
  "updated_asc",
  "received_desc",
  "received_asc",
] as const;
const defaultSort = "last_customer_desc";
const validSorts = new Set<string>(ticketSorts);

type TicketSort = (typeof ticketSorts)[number];

type TicketSearchParams = {
  q?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  sort?: string;
  view?: string;
  includeClosed?: string;
  prefs?: string;
  page?: string;
};

const pageSize = 25;
const ticketPreferenceViewKeys = ["all", "mine", "unassigned"] as const;

const activeAgingStatuses = new Set<TicketStatusValue>([
  TicketStatus.OPEN,
  TicketStatus.PENDING,
]);
const activeTicketStatuses = [
  TicketStatus.OPEN,
  TicketStatus.PENDING,
  TicketStatus.WAITING_ON_CUSTOMER,
  TicketStatus.WAITING_ON_THIRD_PARTY,
] as const;
const waitingTicketStatuses = [
  TicketStatus.PENDING,
  TicketStatus.WAITING_ON_CUSTOMER,
  TicketStatus.WAITING_ON_THIRD_PARTY,
] as const;

function normalizeEnumValues<T extends string>(
  value: string | undefined,
  validValues: Set<T>,
) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toUpperCase() as T)
        .filter((item) => validValues.has(item)),
    ),
  );
}

function normalizeSort(value: string | undefined): TicketSort {
  return validSorts.has(value as TicketSort)
    ? (value as TicketSort)
    : defaultSort;
}

function hasTicketSearchParams(searchParams: TicketSearchParams) {
  return Object.entries(searchParams).some(
    ([key, value]) => key !== "prefs" && Boolean(value),
  );
}

function getTicketPreferenceViewKey(view: string | null | undefined) {
  return view === "mine" || view === "unassigned" ? view : "all";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasPreferenceValues(preference: Partial<TicketSearchParams>) {
  return Object.keys(preference).length > 0;
}

function normalizeSavedPreferenceValue(
  value: unknown,
): Partial<TicketSearchParams> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const preference: Partial<TicketSearchParams> = {};
  const statuses = normalizeEnumValues<TicketStatusValue>(
    typeof source.status === "string" ? source.status : undefined,
    validStatuses,
  );
  const priorities = normalizeEnumValues<TicketPriorityValue>(
    typeof source.priority === "string" ? source.priority : undefined,
    validPriorities,
  );
  const assignees =
    typeof source.assignee === "string"
      ? Array.from(
          new Set(
            source.assignee
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : [];
  const sort = normalizeSort(
    typeof source.sort === "string" ? source.sort : undefined,
  );

  if (statuses.length > 0) {
    preference.status = statuses.join(",");
  }

  if (priorities.length > 0) {
    preference.priority = priorities.join(",");
  }

  if (assignees.length > 0) {
    preference.assignee = assignees.join(",");
  }

  if (sort !== defaultSort) {
    preference.sort = sort;
  }

  if (source.view === "mine" || source.view === "unassigned") {
    preference.view = source.view;
  }

  return preference;
}

function getSavedPreferenceForView(
  value: unknown,
  viewKey: (typeof ticketPreferenceViewKeys)[number],
) {
  if (!isRecord(value)) {
    return {};
  }

  if (isRecord(value.views)) {
    return normalizeSavedPreferenceValue(value.views[viewKey]);
  }

  const legacyPreference = normalizeSavedPreferenceValue(value);
  const legacyViewKey = getTicketPreferenceViewKey(legacyPreference.view);

  return legacyViewKey === viewKey ? legacyPreference : {};
}

function buildTicketOrderBy(sort: TicketSort): Prisma.TicketOrderByWithRelationInput[] {
  if (sort === "last_customer_asc") {
    return [
      { lastCustomerMessageAt: { sort: "asc", nulls: "last" } },
      { updatedAt: "asc" },
      { number: "asc" },
    ];
  }

  if (sort === "last_agent_desc") {
    return [
      { lastAgentMessageAt: { sort: "desc", nulls: "last" } },
      { updatedAt: "desc" },
      { number: "desc" },
    ];
  }

  if (sort === "last_agent_asc") {
    return [
      { lastAgentMessageAt: { sort: "asc", nulls: "last" } },
      { updatedAt: "asc" },
      { number: "asc" },
    ];
  }

  if (sort === "updated_desc") {
    return [{ updatedAt: "desc" }, { number: "desc" }];
  }

  if (sort === "updated_asc") {
    return [{ updatedAt: "asc" }, { number: "asc" }];
  }

  if (sort === "received_desc") {
    return [{ createdAt: "desc" }, { number: "desc" }];
  }

  if (sort === "received_asc") {
    return [{ createdAt: "asc" }, { number: "asc" }];
  }

  return [
    { lastCustomerMessageAt: { sort: "desc", nulls: "last" } },
    { updatedAt: "desc" },
    { number: "desc" },
  ];
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
    sort: current.sort,
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
  assignees,
  currentUserId,
  priorities,
  q,
  statuses,
  view,
  includeClosed,
}: {
  assignees: string[];
  currentUserId: string | null;
  includeClosed: boolean;
  priorities: TicketPriorityValue[];
  q: string | null;
  statuses: TicketStatusValue[];
  view: string | null;
}) {
  const clauses: Prisma.TicketWhereInput[] = [];

  if (statuses.length > 0) {
    clauses.push({ status: { in: statuses } });
  } else if (
    !includeClosed &&
    (view === "mine" || view === "unassigned")
  ) {
    clauses.push({
      status: {
        notIn: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
      },
    });
  } else if (!includeClosed) {
    clauses.push({ status: { not: TicketStatus.CLOSED } });
  }

  if (priorities.length > 0) {
    clauses.push({ priority: { in: priorities } });
  }

  if (view === "mine" && currentUserId) {
    clauses.push({ assignedToId: currentUserId });
  } else if (view === "unassigned") {
    clauses.push({ assignedToId: null });
  } else if (assignees.length > 0) {
    const userAssignees = assignees.filter(
      (assignee) => assignee !== unassignedAssigneeValue,
    );
    const includeUnassigned = assignees.includes(unassignedAssigneeValue);
    const assigneeClauses: Prisma.TicketWhereInput[] = [];

    if (userAssignees.length > 0) {
      assigneeClauses.push({ assignedToId: { in: userAssignees } });
    }

    if (includeUnassigned) {
      assigneeClauses.push({ assignedToId: null });
    }

    if (assigneeClauses.length === 1) {
      clauses.push(assigneeClauses[0]);
    } else if (assigneeClauses.length > 1) {
      clauses.push({ OR: assigneeClauses });
    }
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

function formatAge(from: Date) {
  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - from.getTime()) / 60000),
  );

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 48) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

function getStatusBreakdownLabel(counts: Record<TicketStatusValue, number>) {
  const orderedStatuses = [
    TicketStatus.OPEN,
    TicketStatus.PENDING,
    TicketStatus.WAITING_ON_CUSTOMER,
    TicketStatus.WAITING_ON_THIRD_PARTY,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ];

  return orderedStatuses
    .filter((status) => counts[status] > 0)
    .map((status) => `${statusLabels[status]} ${counts[status]}`)
    .join(" · ");
}

function hasExactStatuses(
  currentStatuses: TicketStatusValue[],
  expectedStatuses: readonly TicketStatusValue[],
) {
  if (currentStatuses.length !== expectedStatuses.length) {
    return false;
  }

  const currentSet = new Set(currentStatuses);
  return expectedStatuses.every((status) => currentSet.has(status));
}

function isMissingPreferenceTableError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2021"
  );
}

async function getSavedTicketPreference(userId: string) {
  try {
    return await prisma.userPagePreference.findUnique({
      where: {
        userId_pageKey: {
          userId,
          pageKey: ticketPreferencePageKey,
        },
      },
      select: {
        preferences: true,
      },
    });
  } catch (error) {
    if (isMissingPreferenceTableError(error)) {
      console.warn(
        "[ticket-preferences] UserPagePreference table is missing. Run pnpm db:migrate.",
      );
      return null;
    }

    throw error;
  }
}

async function resolveTicketSearchParams(searchParams: TicketSearchParams) {
  const currentUser = await getCurrentAppUser();
  const savedPreference = currentUser
    ? await getSavedTicketPreference(currentUser.id)
    : null;
  const viewKey = getTicketPreferenceViewKey(searchParams.view);
  const normalizedSavedPreference = getSavedPreferenceForView(
    savedPreference?.preferences,
    viewKey,
  );
  const shouldApplySavedPreference =
    searchParams.prefs !== "off" &&
    hasPreferenceValues(normalizedSavedPreference);
  const hasSearchParams = hasTicketSearchParams(searchParams);

  let resolvedSearchParams = searchParams;

  if (shouldApplySavedPreference && !hasSearchParams) {
    resolvedSearchParams = {
      ...searchParams,
      ...normalizedSavedPreference,
    };
  } else if (
    shouldApplySavedPreference &&
    viewKey !== "all" &&
    searchParams.view
  ) {
    resolvedSearchParams = {
      ...normalizedSavedPreference,
      ...searchParams,
    };
  }

  return {
    currentUser,
    hasSavedPreference: hasPreferenceValues(normalizedSavedPreference),
    searchParams: resolvedSearchParams,
  };
}

async function getDashboardData(
  searchParams: TicketSearchParams,
  currentUser: Awaited<ReturnType<typeof getCurrentAppUser>>,
  hasSavedPreference: boolean,
) {
  const statuses = normalizeEnumValues<TicketStatusValue>(
    searchParams.status,
    validStatuses,
  );
  const priorities = normalizeEnumValues<TicketPriorityValue>(
    searchParams.priority,
    validPriorities,
  );
  const q = searchParams.q?.trim() || null;
  const sort = normalizeSort(searchParams.sort);
  const view = searchParams.view?.trim() || null;
  const assignees = searchParams.assignee
    ? Array.from(
        new Set(
          searchParams.assignee
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const includeClosed = searchParams.includeClosed === "true";
  const filterStatuses =
    statuses.length > 0
      ? statuses
      : view === "mine" || view === "unassigned"
        ? [...activeTicketStatuses]
        : includeClosed
          ? Object.values(TicketStatus)
          : statuses;
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);
  const where = buildTicketWhere({
    assignees,
    currentUserId: currentUser?.id ?? null,
    includeClosed,
    priorities,
    q,
    statuses,
    view,
  });

  const [
    tickets,
    totalTickets,
    agents,
    summaryTickets,
  ] = await Promise.all([
    prisma.ticket.findMany({
      orderBy: buildTicketOrderBy(sort),
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
            messages: {
              where: {
                visibility: MessageVisibility.PUBLIC,
                authorType: MessageAuthorType.AGENT,
              },
            },
          },
        },
        messages: {
          where: {
            visibility: MessageVisibility.PUBLIC,
            authorType: {
              in: [MessageAuthorType.CUSTOMER, MessageAuthorType.AGENT],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
          select: {
            authorType: true,
            createdAt: true,
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
    prisma.ticket.findMany({
      where,
      select: {
        createdAt: true,
        status: true,
        _count: {
          select: {
            messages: {
              where: {
                visibility: MessageVisibility.PUBLIC,
                authorType: MessageAuthorType.AGENT,
              },
            },
          },
        },
        messages: {
          where: {
            visibility: MessageVisibility.PUBLIC,
            authorType: {
              in: [MessageAuthorType.CUSTOMER, MessageAuthorType.AGENT],
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            authorType: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  const statusCounts: Record<TicketStatusValue, number> = {
    [TicketStatus.OPEN]: 0,
    [TicketStatus.PENDING]: 0,
    [TicketStatus.WAITING_ON_CUSTOMER]: 0,
    [TicketStatus.WAITING_ON_THIRD_PARTY]: 0,
    [TicketStatus.RESOLVED]: 0,
    [TicketStatus.CLOSED]: 0,
  };
  let needsResponseCount = 0;
  let oldestWaitingSince: Date | null = null;

  summaryTickets.forEach((ticket) => {
    statusCounts[ticket.status] += 1;

    if (!activeAgingStatuses.has(ticket.status)) {
      return;
    }

    const latestPublicMessage = ticket.messages[0] ?? null;
    const hasAgentReply = ticket._count.messages > 0;
    const waitingSince =
      latestPublicMessage?.authorType === MessageAuthorType.CUSTOMER
        ? latestPublicMessage.createdAt
        : !hasAgentReply
          ? latestPublicMessage?.createdAt ?? ticket.createdAt
          : null;

    if (!waitingSince) {
      return;
    }

    needsResponseCount += 1;

    if (!oldestWaitingSince || waitingSince < oldestWaitingSince) {
      oldestWaitingSince = waitingSince;
    }
  });

  return {
    active: {
      assignees,
      filterStatuses,
      includeClosed,
      page,
      priorities,
      q,
      sort,
      statuses,
      view,
    },
    agents,
    canBulkDelete:
      currentUser?.role === UserRole.SUPER_ADMIN ||
      currentUser?.role === UserRole.MANAGER ||
      currentUser?.role === UserRole.AGENT,
    canBulkUpdateStatus:
      currentUser?.role === UserRole.SUPER_ADMIN ||
      currentUser?.role === UserRole.MANAGER ||
      currentUser?.role === UserRole.AGENT,
    hasSavedPreference,
    summary: {
      needsResponseCount,
      oldestWaitingLabel: oldestWaitingSince
        ? formatAge(oldestWaitingSince)
        : "None",
      statusBreakdown: getStatusBreakdownLabel(statusCounts) || "No tickets",
      totalTickets,
    },
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
  assignees: string[];
  includeClosed: boolean;
  page: number;
  priorities: TicketPriorityValue[];
  q: string | null;
  sort: TicketSort;
  statuses: TicketStatusValue[];
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
      description: "Tickets that need an assignee.",
    };
  }

  if (active.priorities.length === 1 && active.priorities[0] === TicketPriority.URGENT) {
    return {
      badge: "Priority queue",
      title: "Urgent tickets",
      description: "High-attention tickets across the support queue.",
    };
  }

  if (active.statuses.length === 1) {
    return {
      badge: "Status queue",
      title: `${statusLabels[active.statuses[0]]} tickets`,
      description: "Tickets filtered by their current workflow status.",
    };
  }

  if (hasExactStatuses(active.statuses, activeTicketStatuses)) {
    return {
      badge: "Active queue",
      title: "Active Tickets",
      description: "Open tickets and tickets waiting on a customer or teammate.",
    };
  }

  if (hasExactStatuses(active.statuses, waitingTicketStatuses)) {
    return {
      badge: "Waiting queue",
      title: "Waiting on Others",
      description: "Tickets waiting on customers, teammates, or third parties.",
    };
  }

  if (active.statuses.length > 1) {
    return {
      badge: "Status queue",
      title: "Filtered tickets",
      description: "Tickets filtered by multiple workflow statuses.",
    };
  }

  if (active.priorities.length === 1) {
    return {
      badge: "Priority queue",
      title: `${priorityLabels[active.priorities[0]]} priority tickets`,
      description: "Tickets filtered by priority.",
    };
  }

  if (active.priorities.length > 1) {
    return {
      badge: "Priority queue",
      title: "Filtered tickets",
      description: "Tickets filtered by multiple priorities.",
    };
  }

  if (active.assignees.length > 0) {
    return {
      badge: "Assigned queue",
      title: "Filtered tickets",
      description: "Tickets filtered by selected assignees.",
    };
  }

  if (active.includeClosed) {
    return {
      badge: "All tickets",
      title: "All Tickets",
      description: "Every ticket in the system, including closed tickets.",
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
  const rawParams = await searchParams;
  const {
    currentUser,
    hasSavedPreference,
    searchParams: params,
  } = await resolveTicketSearchParams(rawParams);
  const dashboard = await getDashboardData(
    params,
    currentUser,
    hasSavedPreference,
  );
  const activeTab =
    dashboard.active.view === "mine" || dashboard.active.view === "unassigned"
      ? dashboard.active.view
      : "all";
  const hasFilters = Boolean(
    dashboard.active.q ||
      dashboard.active.statuses.length > 0 ||
      dashboard.active.priorities.length > 0 ||
      dashboard.active.assignees.length > 0 ||
      dashboard.active.view ||
      dashboard.active.sort !== defaultSort ||
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
  const hasAgingConcern = dashboard.summary.needsResponseCount > 0;

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

      <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="grid min-w-0 gap-0 sm:grid-cols-2 lg:grid-cols-[0.8fr_0.9fr_0.8fr_1.5fr]">
          <div className="min-w-0 border-b border-zinc-200 px-3 py-2.5 sm:border-r lg:border-b-0">
            <div className="text-xs font-medium text-muted-foreground">
              Tickets in view
            </div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">
              {dashboard.summary.totalTickets}
            </div>
          </div>
          <div className="min-w-0 border-b border-zinc-200 px-3 py-2.5 lg:border-b-0 lg:border-r">
            <div className="text-xs font-medium text-muted-foreground">
              Needs response
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <span className="text-lg font-semibold text-zinc-950">
                {dashboard.summary.needsResponseCount}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  hasAgingConcern
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700",
                )}
              >
                {hasAgingConcern ? "Action needed" : "Clear"}
              </Badge>
            </div>
          </div>
          <div className="min-w-0 border-b border-zinc-200 px-3 py-2.5 sm:border-r sm:border-b-0">
            <div className="text-xs font-medium text-muted-foreground">
              Oldest waiting
            </div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">
              {dashboard.summary.oldestWaitingLabel}
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-xs font-medium text-muted-foreground">
              By status
            </div>
            <div className="mt-1 break-words text-sm font-medium text-zinc-950 [overflow-wrap:anywhere]">
              {dashboard.summary.statusBreakdown}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <TicketSearchControl active={dashboard.active} />
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
            hasSavedPreference={dashboard.hasSavedPreference}
          />
        </div>
        <Separator />
        <TicketBulkTable
          activeStatus={
            dashboard.active.statuses.length === 1
              ? dashboard.active.statuses[0]
              : null
          }
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
