"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Paperclip, Trash2, X } from "lucide-react";

import {
  bulkDeleteClosedTickets,
  bulkUpdateTicketStatus,
} from "@/app/(app)/tickets/actions";
import { StatusDefinitionsMenu } from "@/components/app/status-definitions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  MessageAuthorType,
  TicketPriority,
  TicketStatus,
  type MessageAuthorType as MessageAuthorTypeValue,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import {
  getTicketAgingClass,
  getTicketAgingState,
} from "@/lib/ticket-aging";

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

const priorityStyles: Record<TicketPriorityValue, string> = {
  [TicketPriority.URGENT]: "text-red-700",
  [TicketPriority.HIGH]: "text-orange-700",
  [TicketPriority.NORMAL]: "text-muted-foreground",
  [TicketPriority.LOW]: "text-muted-foreground",
};

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

type TicketBulkTableTicket = {
  assignedTo: {
    email: string;
    name: string | null;
  } | null;
  customer: {
    email: string;
    name: string | null;
  };
  createdAt: Date | string;
  id: string;
  messages: Array<{
    authorType: MessageAuthorTypeValue;
    createdAt: Date | string;
  }>;
  number: number;
  priority: TicketPriorityValue;
  status: TicketStatusValue;
  subject: string;
  updatedAt: Date | string;
  _count: {
    attachments: number;
    messages: number;
  };
};

type TicketBulkTableProps = {
  activeStatus: TicketStatusValue | null;
  canBulkDelete: boolean;
  canBulkUpdateStatus: boolean;
  hasFilters: boolean;
  includeClosed: boolean;
  tickets: TicketBulkTableTicket[];
};

function formatRelativeTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const updatedDay = new Date(date);
  updatedDay.setHours(0, 0, 0, 0);
  const diffDays = Math.max(
    0,
    Math.floor((today.getTime() - updatedDay.getTime()) / 86400000),
  );

  if (diffDays > 0) {
    return `${diffDays}d · ${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

export function TicketBulkTable({
  activeStatus,
  canBulkDelete,
  canBulkUpdateStatus,
  hasFilters,
  includeClosed,
  tickets,
}: TicketBulkTableProps) {
  const router = useRouter();
  const [displayTickets, setDisplayTickets] =
    useState<TicketBulkTableTicket[]>(tickets);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<TicketStatusValue>(TicketStatus.CLOSED);
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    displayTickets.length > 0 &&
    displayTickets.every((ticket) => selectedSet.has(ticket.id));
  const canSelectTickets = canBulkDelete || canBulkUpdateStatus;
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setDisplayTickets(tickets);
    setSelectedIds((current) => {
      const visibleIds = new Set(tickets.map((ticket) => ticket.id));
      return current.filter((ticketId) => visibleIds.has(ticketId));
    });
  }, [tickets]);

  function shouldKeepTicketAfterStatusChange(nextStatus: TicketStatusValue) {
    if (activeStatus) {
      return nextStatus === activeStatus;
    }

    return includeClosed || nextStatus !== TicketStatus.CLOSED;
  }

  function setTicketSelected(ticketId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? Array.from(new Set([...current, ticketId]))
        : current.filter((id) => id !== ticketId),
    );
  }

  function setAllVisibleSelected(checked: boolean) {
    setSelectedIds(checked ? displayTickets.map((ticket) => ticket.id) : []);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function selectedFormData() {
    const formData = new FormData();

    for (const ticketId of selectedIds) {
      formData.append("ticketIds", ticketId);
    }

    return formData;
  }

  function runBulkStatusUpdate() {
    startTransition(async () => {
      try {
        const formData = selectedFormData();
        formData.set("status", status);
        const result = await bulkUpdateTicketStatus(formData);

        toast({
          variant: "success",
          title: "Tickets updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.flatMap((ticket) => {
            if (!selectedSet.has(ticket.id)) {
              return [ticket];
            }

            if (!shouldKeepTicketAfterStatusChange(status)) {
              return [];
            }

            return [
              {
                ...ticket,
                status,
                updatedAt: new Date(),
              },
            ];
          }),
        );
        setSelectedIds([]);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Bulk update failed",
          description:
            error instanceof Error ? error.message : "Tickets were not updated.",
        });
      }
    });
  }

  function runBulkDelete() {
    startTransition(async () => {
      try {
        const result = await bulkDeleteClosedTickets(selectedFormData());

        toast({
          variant: "success",
          title: "Tickets deleted",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.filter(
            (ticket) =>
              !selectedSet.has(ticket.id) || ticket.status !== TicketStatus.CLOSED,
          ),
        );
        setSelectedIds([]);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Bulk delete failed",
          description:
            error instanceof Error ? error.message : "Tickets were not deleted.",
        });
      }
    });
  }

  return (
    <>
      {canSelectTickets && selectedCount > 0 ? (
        <div className="flex min-w-0 flex-col gap-3 border-b border-zinc-200 bg-cyan-50/70 px-3 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="secondary" className="shrink-0">
              {selectedCount} selected
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={clearSelection}
            >
              <X data-icon="inline-start" />
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canBulkUpdateStatus ? (
              <>
                <span className="text-xs font-medium text-muted-foreground">
                  Set status
                </span>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as TicketStatusValue)
                  }
                >
                  <SelectTrigger size="sm" className="w-[190px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.values(TicketStatus).map((option) => (
                        <SelectItem key={option} value={option}>
                          {statusLabels[option]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending}
                  onClick={runBulkStatusUpdate}
                >
                  Apply
                </Button>
              </>
            ) : null}
            {canBulkDelete ? (
              <>
                {canBulkUpdateStatus ? (
                  <div className="mx-1 hidden h-5 w-px bg-zinc-300 sm:block" />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={runBulkDelete}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete closed
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="min-w-0 overflow-x-auto">
        <Table className="min-w-full table-fixed">
          <TableHeader className="bg-zinc-50">
            <TableRow>
              {canSelectTickets ? (
                <TableHead className="w-[44px] text-center">
                  <input
                    aria-label="Select all visible tickets"
                    checked={allVisibleSelected}
                    disabled={displayTickets.length === 0}
                    type="checkbox"
                    onChange={(event) =>
                      setAllVisibleSelected(event.target.checked)
                    }
                  />
                </TableHead>
              ) : null}
              <TableHead className="w-[82px]">Ticket</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="hidden w-[220px] lg:table-cell">
                Customer
              </TableHead>
              <TableHead className="hidden w-[150px] md:table-cell">
                <div className="flex items-center gap-1">
                  Status
                  <StatusDefinitionsMenu />
                </div>
              </TableHead>
              <TableHead className="hidden w-[90px] xl:table-cell">
                Priority
              </TableHead>
              <TableHead className="hidden w-[150px] xl:table-cell">
                Owner
              </TableHead>
              <TableHead className="w-[150px] text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayTickets.map((ticket) => {
              const assigneeName =
                ticket.assignedTo?.name ??
                ticket.assignedTo?.email ??
                "Unassigned";
              const customerName = ticket.customer.name ?? ticket.customer.email;
              const latestCustomerMessage = ticket.messages.find(
                (message) => message.authorType === MessageAuthorType.CUSTOMER,
              );
              const latestAgentMessage = ticket.messages.find(
                (message) => message.authorType === MessageAuthorType.AGENT,
              );
              const agingState = getTicketAgingState({
                createdAt: ticket.createdAt,
                hasAgentReply: ticket._count.messages > 0,
                latestAgentMessageAt: latestAgentMessage?.createdAt ?? null,
                latestCustomerMessageAt: latestCustomerMessage?.createdAt ?? null,
                status: ticket.status,
              });

              return (
                <TableRow key={ticket.id} className="hover:bg-zinc-50/80">
              {canSelectTickets ? (
                    <TableCell className="text-center">
                      <input
                        aria-label={`Select ticket #${ticket.number}`}
                        checked={selectedSet.has(ticket.id)}
                        type="checkbox"
                        onChange={(event) =>
                          setTicketSelected(ticket.id, event.target.checked)
                        }
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="whitespace-nowrap font-medium text-zinc-500">
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="hover:text-zinc-950 hover:underline"
                    >
                      #{ticket.number}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-0 whitespace-normal">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/tickets/${ticket.id}`}
                          className="line-clamp-2 break-words font-medium text-zinc-950 hover:underline [overflow-wrap:anywhere]"
                        >
                          {ticket.subject}
                        </Link>
                        <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere] lg:hidden">
                          {customerName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:hidden">
                          <Badge
                            variant="outline"
                            className={statusStyles[ticket.status]}
                          >
                            {statusLabels[ticket.status]}
                          </Badge>
                          <span className={priorityStyles[ticket.priority]}>
                            {priorityLabels[ticket.priority]}
                          </span>
                        </div>
                      </div>
                      {ticket._count.attachments > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" />
                          {ticket._count.attachments}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal break-words [overflow-wrap:anywhere] lg:table-cell">
                    {customerName}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant="outline"
                      className={statusStyles[ticket.status]}
                    >
                      {statusLabels[ticket.status]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`hidden xl:table-cell ${priorityStyles[ticket.priority]}`}
                  >
                    {priorityLabels[ticket.priority]}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal break-words [overflow-wrap:anywhere] xl:table-cell">
                    {assigneeName}
                  </TableCell>
                  <TableCell className="w-[150px] whitespace-nowrap text-right text-muted-foreground">
                    <div>{formatRelativeTime(ticket.updatedAt)}</div>
                    {agingState ? (
                      <div className="mt-1 flex justify-end">
                        <Badge
                          variant="outline"
                          className={getTicketAgingClass(agingState.severity)}
                        >
                          {agingState.label} · {agingState.ageLabel}
                        </Badge>
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {displayTickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canSelectTickets ? 8 : 7}
                  className="h-28 text-center text-muted-foreground"
                >
                  {hasFilters
                    ? "No tickets match the current filters."
                    : "No tickets yet. Run pnpm db:seed to add sample data."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
