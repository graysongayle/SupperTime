import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MessageSquare, Phone, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TicketPriority,
  TicketStatus,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
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

const statusStyles: Record<TicketStatusValue, string> = {
  [TicketStatus.OPEN]: "border-teal-200 bg-teal-50 text-teal-800",
  [TicketStatus.PENDING]: "border-sky-200 bg-sky-50 text-sky-800",
  [TicketStatus.WAITING_ON_CUSTOMER]:
    "border-amber-200 bg-amber-50 text-amber-800",
  [TicketStatus.WAITING_ON_THIRD_PARTY]:
    "border-violet-200 bg-violet-50 text-violet-800",
  [TicketStatus.RESOLVED]: "border-emerald-200 bg-emerald-50 text-emerald-800",
  [TicketStatus.CLOSED]: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

const priorityLabels: Record<TicketPriorityValue, string> = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};

const priorityStyles: Record<TicketPriorityValue, string> = {
  [TicketPriority.URGENT]: "text-red-700",
  [TicketPriority.HIGH]: "text-orange-700",
  [TicketPriority.NORMAL]: "text-muted-foreground",
  [TicketPriority.LOW]: "text-muted-foreground",
};

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

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: {
      id: customerId,
    },
    include: {
      _count: {
        select: {
          messages: true,
          participants: true,
          tickets: true,
        },
      },
      tickets: {
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          assignedTo: {
            select: {
              email: true,
              name: true,
            },
          },
          _count: {
            select: {
              attachments: true,
              messages: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    notFound();
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/customers">
              <ArrowLeft className="size-4" />
              Back to customers
            </Link>
          </Button>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-cyan-800"
            >
              Customer
            </Badge>
            <Badge variant="outline">{customer._count.tickets} tickets</Badge>
          </div>
          <h1 className="max-w-4xl break-words text-2xl font-semibold tracking-normal text-zinc-950 [overflow-wrap:anywhere]">
            {customer.name ?? customer.email}
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Customer record created {formatDate(customer.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <a
                  href={`mailto:${customer.email}`}
                  className="min-w-0 break-words text-zinc-950 hover:underline [overflow-wrap:anywhere]"
                >
                  {customer.email}
                </a>
              </div>
              <div className="flex min-w-0 items-start gap-2">
                <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
                  {customer.phone ?? "No phone number"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Ticket className="size-4" />
                  Tickets
                </span>
                <span className="font-medium text-zinc-950">
                  {customer._count.tickets}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="size-4" />
                  Messages
                </span>
                <span className="font-medium text-zinc-950">
                  {customer._count.messages}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">
              Related tickets
            </h2>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-full table-fixed">
              <TableHeader className="bg-zinc-50">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="w-[150px]">Status</TableHead>
                  <TableHead className="hidden w-[110px] md:table-cell">
                    Priority
                  </TableHead>
                  <TableHead className="hidden w-[160px] lg:table-cell">
                    Assigned
                  </TableHead>
                  <TableHead className="w-[150px] text-right">
                    Updated
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.tickets.map((ticket) => (
                  <TableRow key={ticket.id} className="hover:bg-zinc-50/80">
                    <TableCell className="min-w-0 whitespace-normal">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="break-words font-medium text-zinc-950 hover:underline [overflow-wrap:anywhere]"
                      >
                        #{ticket.number} {ticket.subject}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{ticket._count.messages} messages</span>
                        <span>{ticket._count.attachments} attachments</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusStyles[ticket.status]}
                      >
                        {statusLabels[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden md:table-cell",
                        priorityStyles[ticket.priority],
                      )}
                    >
                      {priorityLabels[ticket.priority]}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere] lg:table-cell">
                      {ticket.assignedTo?.name ??
                        ticket.assignedTo?.email ??
                        "Unassigned"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {formatDate(ticket.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {customer.tickets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-28 text-center text-muted-foreground"
                    >
                      This customer does not have any tickets yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}
