import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, MessageSquareText, RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MessageVisibility,
  TicketStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { requireSuperAdmin } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const roleLabels = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.MANAGER]: "Manager",
  [UserRole.AGENT]: "Agent",
  [UserRole.GUEST]: "Guest",
};

const roleStyles = {
  [UserRole.SUPER_ADMIN]: "border-indigo-200 bg-indigo-50 text-indigo-800",
  [UserRole.MANAGER]: "border-cyan-200 bg-cyan-50 text-cyan-800",
  [UserRole.AGENT]: "border-zinc-200 bg-zinc-50 text-zinc-700",
  [UserRole.GUEST]: "border-amber-200 bg-amber-50 text-amber-800",
};

const statusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

function formatDate(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatNullableDate(date: Date | null) {
  return date ? formatDate(date) : "Not recorded";
}

function getMessagePreview(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "No message body.";
  }

  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

export default async function UserHistoryPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requireSuperAdmin();

  if (!actor) {
    notFound();
  }

  const { userId } = await params;
  const [user, messages, statusChanges] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        createdAt: true,
        email: true,
        id: true,
        isActive: true,
        lastLoginAt: true,
        lastSeenAt: true,
        name: true,
        role: true,
        updatedAt: true,
      },
    }),
    prisma.ticketMessage.findMany({
      where: {
        agentId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            subject: true,
          },
        },
      },
    }),
    prisma.ticketStatusHistory.findMany({
      where: {
        changedById: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      include: {
        ticket: {
          select: {
            id: true,
            number: true,
            subject: true,
          },
        },
      },
    }),
  ]);

  if (!user) {
    notFound();
  }

  const events = [
    ...messages.map((message) => ({
      body: getMessagePreview(message.body),
      createdAt: message.createdAt,
      href: `/tickets/${message.ticket.id}`,
      icon: MessageSquareText,
      id: `message-${message.id}`,
      kind:
        message.visibility === MessageVisibility.INTERNAL
          ? "Internal note"
          : "Ticket reply",
      subject: `#${message.ticket.number} ${message.ticket.subject}`,
    })),
    ...statusChanges.map((entry) => ({
      body: `${entry.from ? `${statusLabels[entry.from]} -> ` : ""}${
        statusLabels[entry.to]
      }`,
      createdAt: entry.createdAt,
      href: `/tickets/${entry.ticket.id}`,
      icon: RotateCw,
      id: `status-${entry.id}`,
      kind: "Status change",
      subject: `#${entry.ticket.number} ${entry.ticket.subject}`,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const lastTicketActionAt = events[0]?.createdAt ?? null;

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/admin/users">
            <ArrowLeft className="size-4" />
            Back to users
          </Link>
        </Button>
        <div className="mb-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-800"
          >
            <History className="size-3" />
            Super-admin only
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
          User history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.name ?? user.email}
        </p>
      </div>

      <div className="space-y-5">
        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">User summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-950">
                    {user.name ?? "Unnamed user"}
                  </div>
                  <div className="truncate text-muted-foreground">
                    {user.email}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className={
                      user.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600"
                    }
                  >
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="outline" className={roleStyles[user.role]}>
                    {roleLabels[user.role]}
                  </Badge>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-2 border-t border-zinc-200 pt-4 md:grid-cols-3">
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <dt className="text-muted-foreground">Last login</dt>
                  <dd className="text-zinc-950">
                    {formatNullableDate(user.lastLoginAt)}
                  </dd>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd className="text-zinc-950">
                    {formatNullableDate(user.lastSeenAt)}
                  </dd>
                </div>
                <div className="grid grid-cols-[130px_1fr] gap-3">
                  <dt className="text-muted-foreground">Last ticket action</dt>
                  <dd className="text-zinc-950">
                    {formatNullableDate(lastTicketActionAt)}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recorded activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              This view currently includes ticket replies/internal notes and
              ticket status changes. Role changes, assignment changes, priority
              changes, and ticket deletion events are not yet stored in a
              durable audit table.
            </div>

            {events.map((event) => {
              const Icon = event.icon;

              return (
                <Link
                  key={event.id}
                  href={event.href}
                  className="block rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm transition-colors hover:bg-zinc-100"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-cyan-700 ring-1 ring-zinc-200">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-950">
                          {event.kind}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(event.createdAt)}
                        </span>
                      </span>
                      <span className="mt-1 block font-medium text-zinc-800">
                        {event.subject}
                      </span>
                      <span className="mt-1 block text-muted-foreground">
                        {event.body}
                      </span>
                    </span>
                  </div>
                </Link>
              );
            })}

            {events.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-muted-foreground">
                No recorded ticket activity for this user yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
