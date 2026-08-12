import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Mail,
  Plus,
  Tag,
  UserRound,
  X,
} from "lucide-react";

import {
  addTicketTag,
  removeTicketTag,
} from "@/app/(app)/tickets/actions";
import { DeleteTicketForm } from "@/components/app/delete-ticket-form";
import { InternalNoteForm } from "@/components/app/internal-note-form";
import { TicketPropertiesForm } from "@/components/app/ticket-properties-form";
import { TicketForwardSheet } from "@/components/app/ticket-forward-sheet";
import { TicketTimeline } from "@/components/app/ticket-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  MessageAuthorType,
  MessageVisibility,
  TicketPriority,
  TicketParticipantRole,
  TicketSource,
  TicketStatus,
  UserRole,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";
import {
  getSupportSender,
  isSupportEmailAddress,
} from "@/lib/support-email";
import {
  getTicketAgingClass,
  getTicketAgingState,
} from "@/lib/ticket-aging";

export const dynamic = "force-dynamic";

const statusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

const statusStyles = {
  [TicketStatus.OPEN]: "border-teal-200 bg-teal-50 text-teal-800",
  [TicketStatus.PENDING]: "border-sky-200 bg-sky-50 text-sky-800",
  [TicketStatus.WAITING_ON_CUSTOMER]: "border-amber-200 bg-amber-50 text-amber-800",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "border-violet-200 bg-violet-50 text-violet-800",
  [TicketStatus.RESOLVED]: "border-emerald-200 bg-emerald-50 text-emerald-800",
  [TicketStatus.CLOSED]: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const priorityLabels = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};

const sourceLabels = {
  [TicketSource.EMAIL]: "Email",
  [TicketSource.EMBEDDED_FORM]: "Embedded Form",
  [TicketSource.MANUAL]: "Manual",
  [TicketSource.FRESHDESK_IMPORT]: "Freshdesk Import",
};
const validStatuses = new Set<TicketStatusValue>(Object.values(TicketStatus));
const validPriorities = new Set<TicketPriorityValue>(
  Object.values(TicketPriority),
);
const unassignedAssigneeValue = "unassigned";
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

function formatDate(date: Date | null) {
  if (!date) {
    return "Not set";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTicketsReturnHref(value: string | undefined) {
  if (!value) {
    return "/tickets";
  }

  if (value === "/tickets" || value.startsWith("/tickets?")) {
    return value;
  }

  return "/tickets";
}

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

function buildTicketWhere({
  assignees,
  currentUserId,
  includeClosed,
  priorities,
  q,
  statuses,
  view,
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

function getTicketListSearchParams(returnHref: string) {
  const [, query = ""] = returnHref.split("?");
  return new URLSearchParams(query);
}

function getTicketDetailHref(ticketId: string, returnHref: string) {
  return `/tickets/${ticketId}?from=${encodeURIComponent(returnHref)}`;
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { ticketId } = await params;
  const { from } = await searchParams;
  const returnHref = getTicketsReturnHref(from);
  const [ticket, agents, tags, viewer] = await Promise.all([
    prisma.ticket.findUnique({
      where: {
        id: ticketId,
      },
      include: {
        customer: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            agent: {
              select: {
                name: true,
                email: true,
              },
            },
            customer: {
              select: {
                name: true,
                email: true,
              },
            },
            attachments: true,
          },
        },
        attachments: true,
        participants: {
          orderBy: [
            {
              role: "asc",
            },
            {
              email: "asc",
            },
          ],
        },
        tagLinks: {
          include: {
            tag: true,
          },
          orderBy: {
            tag: {
              name: "asc",
            },
          },
        },
        statusHistory: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            changedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
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
    prisma.tag.findMany({
      orderBy: {
        name: "asc",
      },
    }),
    getCurrentAppUser(),
  ]);

  if (!ticket) {
    notFound();
  }

  const listSearchParams = getTicketListSearchParams(returnHref);
  const listStatuses = normalizeEnumValues<TicketStatusValue>(
    listSearchParams.get("status") ?? undefined,
    validStatuses,
  );
  const listPriorities = normalizeEnumValues<TicketPriorityValue>(
    listSearchParams.get("priority") ?? undefined,
    validPriorities,
  );
  const listAssignees = listSearchParams.get("assignee")
    ? Array.from(
        new Set(
          listSearchParams
            .get("assignee")!
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      )
    : [];
  const listSort = normalizeSort(listSearchParams.get("sort") ?? undefined);
  const listView = listSearchParams.get("view")?.trim() || null;
  const listWhere = buildTicketWhere({
    assignees: listAssignees,
    currentUserId: viewer?.id ?? null,
    includeClosed: listSearchParams.get("includeClosed") === "true",
    priorities: listPriorities,
    q: listSearchParams.get("q")?.trim() || null,
    statuses: listStatuses,
    view: listView,
  });
  const listTickets = await prisma.ticket.findMany({
    where: listWhere,
    orderBy: buildTicketOrderBy(listSort),
    select: {
      id: true,
      number: true,
      subject: true,
    },
  });
  const currentListIndex = listTickets.findIndex(
    (listTicket) => listTicket.id === ticket.id,
  );
  const previousTicket =
    currentListIndex > 0 ? listTickets[currentListIndex - 1] : null;
  const nextTicket =
    currentListIndex >= 0 && currentListIndex < listTickets.length - 1
      ? listTickets[currentListIndex + 1]
      : null;

  const cannedResponses =
    viewer && viewer.isActive && viewer.role !== UserRole.GUEST
      ? await prisma.cannedResponse.findMany({
          where: {
            userId: viewer.id,
          },
          orderBy: [
            {
              sortOrder: "asc",
            },
            {
              title: "asc",
            },
          ],
          select: {
            id: true,
            title: true,
            body: true,
            bodyHtml: true,
          },
        })
      : [];

  await prisma.$executeRaw`
    update "Ticket"
    set "customerResponseUnreadAt" = null
    where "id" = ${ticket.id}
      and "customerResponseUnreadAt" is not null
  `;

  const existingTagNames = new Set(ticket.tagLinks.map((link) => link.tag.name));
  const visibleParticipants = ticket.participants.filter(
    (participant) => !isSupportEmailAddress(participant.email),
  );
  const canPermanentlyDelete =
    (viewer?.role === UserRole.SUPER_ADMIN ||
      viewer?.role === UserRole.MANAGER ||
      viewer?.role === UserRole.AGENT) &&
    ticket.status === TicketStatus.CLOSED;
  const publicMessages = ticket.messages.filter(
    (message) => message.visibility === MessageVisibility.PUBLIC,
  );
  const latestCustomerMessage = publicMessages.find(
    (message) => message.authorType === MessageAuthorType.CUSTOMER,
  );
  const latestAgentMessage = publicMessages.find(
    (message) => message.authorType === MessageAuthorType.AGENT,
  );
  const agingState = getTicketAgingState({
    createdAt: ticket.createdAt,
    hasAgentReply: Boolean(latestAgentMessage),
    latestAgentMessageAt: latestAgentMessage?.createdAt ?? null,
    latestCustomerMessageAt: latestCustomerMessage?.createdAt ?? null,
    status: ticket.status,
  });
  const supportSender = getSupportSender();

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href={returnHref}>
              <ArrowLeft className="size-4" />
              Back to tickets
            </Link>
          </Button>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusStyles[ticket.status]}>
              {statusLabels[ticket.status]}
            </Badge>
            <Badge variant="outline">#{ticket.number}</Badge>
            {agingState ? (
              <Badge
                variant="outline"
                className={getTicketAgingClass(agingState.severity)}
              >
                {agingState.label} · {agingState.ageLabel}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {sourceLabels[ticket.source]}
            </span>
          </div>
          <h1 className="max-w-4xl break-words text-2xl font-semibold tracking-normal text-zinc-950 [overflow-wrap:anywhere]">
            {ticket.subject}
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {ticket.customer.name ?? ticket.customer.email} · created{" "}
            {formatDate(ticket.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {previousTicket ? (
            <Button variant="outline" size="sm" asChild className="bg-white">
              <Link
                href={getTicketDetailHref(previousTicket.id, returnHref)}
                title={`Previous ticket: #${previousTicket.number} ${previousTicket.subject}`}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="bg-white">
              <ChevronLeft className="size-4" />
              Previous
            </Button>
          )}
          {nextTicket ? (
            <Button variant="outline" size="sm" asChild className="bg-white">
              <Link
                href={getTicketDetailHref(nextTicket.id, returnHref)}
                title={`Next ticket: #${nextTicket.number} ${nextTicket.subject}`}
              >
                Next
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="bg-white">
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
          <TicketForwardSheet
            ticketId={ticket.id}
            ticketNumber={ticket.number}
            ticketSubject={ticket.subject}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <TicketTimeline
            cannedResponses={cannedResponses}
            description={ticket.description}
            messages={ticket.messages.map((message) => ({
              id: message.id,
              agent: message.agent,
              attachments: message.attachments.map((attachment) => ({
                id: attachment.id,
                contentType: attachment.contentType,
                fileName: attachment.fileName,
                sizeBytes: attachment.sizeBytes,
              })),
              authorType: message.authorType,
              body: message.body,
              bodyHtml: message.bodyHtml,
              createdAt: message.createdAt.toISOString(),
              customer: message.customer,
              emailCc: message.emailCc,
              emailFrom:
                message.authorType === MessageAuthorType.AGENT
                  ? supportSender.formatted
                  : message.emailFrom,
              emailTo: message.emailTo,
              visibility: message.visibility,
            }))}
            participants={visibleParticipants.map((participant) => ({
              id: participant.id,
              email: participant.email,
              name: participant.name,
              role: participant.role,
            }))}
            supportEmail={supportSender.email}
            ticketId={ticket.id}
          />

          <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Add internal note</CardTitle>
            </CardHeader>
            <CardContent>
              <InternalNoteForm
                currentUserId={viewer?.id ?? null}
                mentionUsers={agents}
                ticketId={ticket.id}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5">
          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketPropertiesForm
                agents={agents}
                assignedToId={ticket.assignedToId}
                priority={ticket.priority}
                status={ticket.status}
                ticketId={ticket.id}
              />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="size-4 text-cyan-700" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link
                href={`/customers/${ticket.customer.id}`}
                className="font-medium text-zinc-950 hover:text-cyan-700 hover:underline"
              >
                {ticket.customer.name ?? "Unnamed customer"}
              </Link>
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <Mail className="size-4" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {ticket.customer.email}
                </span>
              </div>
              {ticket.customer.phone ? (
                <div className="text-muted-foreground">{ticket.customer.phone}</div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Participants</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {visibleParticipants.map((participant) => (
                <div key={participant.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-zinc-950 [overflow-wrap:anywhere]">
                      {participant.name ?? participant.email}
                    </span>
                    <Badge variant="outline">
                      {participant.role === TicketParticipantRole.REQUESTER
                        ? "Requester"
                        : participant.role === TicketParticipantRole.CC
                          ? "CC"
                          : participant.role === TicketParticipantRole.TO
                            ? "To"
                            : "Other"}
                    </Badge>
                  </div>
                  <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {participant.email}
                  </div>
                </div>
              ))}
              {visibleParticipants.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No participants recorded.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="size-4 text-cyan-700" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {ticket.tagLinks.map((link) => (
                  <form key={link.tagId} action={removeTicketTag}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="tagId" value={link.tagId} />
                    <Badge variant="outline" className="gap-1">
                      {link.tag.name}
                      <button type="submit" aria-label={`Remove ${link.tag.name}`}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </form>
                ))}
                {ticket.tagLinks.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No tags yet.</span>
                ) : null}
              </div>

              <form action={addTicketTag} className="flex gap-2">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input
                  list="available-tags"
                  name="tagName"
                  required
                  placeholder="Add tag"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
                />
                <datalist id="available-tags">
                  {tags
                    .filter((tag) => !existingTagNames.has(tag.name))
                    .map((tag) => (
                      <option key={tag.id} value={tag.name} />
                    ))}
                </datalist>
                <Button type="submit" size="sm">
                  <Plus className="size-4" />
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          {canPermanentlyDelete ? (
            <Card className="rounded-lg border-red-200 bg-red-50/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-red-950">
                  Danger zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-red-900">
                  This permanently removes the closed ticket and its messages,
                  participants, attachments, tags, and status history from the
                  database.
                </p>
                <DeleteTicketForm
                  ticketId={ticket.id}
                  ticketNumber={ticket.number}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDot className="size-4 text-cyan-700" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Messages</span>
                <span>{ticket.messages.length}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Created</span>
                <span className="text-right">{formatDate(ticket.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-right">{formatDate(ticket.updatedAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Resolved</span>
                <span className="text-right">{formatDate(ticket.resolvedAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Status history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.statusHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                >
                  <div className="font-medium text-zinc-950">
                    {entry.from ? `${statusLabels[entry.from]} -> ` : ""}
                    {statusLabels[entry.to]}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.changedBy?.name ?? entry.changedBy?.email ?? "System"} ·{" "}
                    {formatDate(entry.createdAt)}
                  </div>
                  {entry.note ? (
                    <p className="mt-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {entry.note}
                    </p>
                  ) : null}
                </div>
              ))}
              {ticket.statusHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No status changes yet.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
