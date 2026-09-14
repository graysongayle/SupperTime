"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { MoreHorizontal, Paperclip, Trash2, X } from "lucide-react";

import {
  addTicketTag,
  bulkDeleteClosedTickets,
  bulkAddTicketTag,
  bulkUpdateTicketAssignment,
  bulkUpdateTicketPriority,
  bulkUpdateTicketStatus,
  markTicketUnread,
  updateTicketAssignment,
  updateTicketPriority,
  updateTicketStatus,
} from "@/app/(app)/tickets/actions";
import { StatusDefinitionsMenu } from "@/components/app/status-definitions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";

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
const unassignedAssigneeValue = "unassigned";

type TicketBulkTableAgent = {
  email: string;
  id: string;
  name: string | null;
};

type TicketBulkTableTag = {
  color: string | null;
  id: string;
  name: string;
};

type TicketBulkTableTicket = {
  assignedTo: {
    email: string;
    id: string;
    name: string | null;
  } | null;
  customer: {
    email: string;
    name: string | null;
  };
  createdAt: Date | string;
  id: string;
  hasNewCustomerResponse: boolean;
  lastAgentMessageAt: Date | string | null;
  lastCustomerMessageAt: Date | string | null;
  messages: Array<{
    authorType: MessageAuthorTypeValue;
    createdAt: Date | string;
  }>;
  number: number;
  priority: TicketPriorityValue;
  status: TicketStatusValue;
  subject: string;
  tagLinks: Array<{
    tag: TicketBulkTableTag;
    tagId: string;
  }>;
  updatedAt: Date | string;
  _count: {
    attachments: number;
    messages: number;
  };
};

type TicketBulkTableProps = {
  activeStatus: TicketStatusValue | null;
  agents: TicketBulkTableAgent[];
  canBulkDelete: boolean;
  canBulkUpdateStatus: boolean;
  hasFilters: boolean;
  includeClosed: boolean;
  renderedAt: string;
  returnHref: string;
  tags: TicketBulkTableTag[];
  tickets: TicketBulkTableTicket[];
};

function formatRelativeTime(value: Date | string, nowValue: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
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

function formatOptionalRelativeTime(
  value: Date | string | null,
  nowValue: Date | string,
) {
  return value ? formatRelativeTime(value, nowValue) : "None";
}

export function TicketBulkTable({
  activeStatus,
  agents,
  canBulkDelete,
  canBulkUpdateStatus,
  hasFilters,
  includeClosed,
  renderedAt,
  returnHref,
  tags,
  tickets,
}: TicketBulkTableProps) {
  const router = useRouter();
  const [displayTickets, setDisplayTickets] =
    useState<TicketBulkTableTicket[]>(tickets);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAssignedToId, setBulkAssignedToId] = useState<string | null>(null);
  const [bulkPriority, setBulkPriority] =
    useState<TicketPriorityValue | null>(null);
  const [bulkStatus, setBulkStatus] = useState<TicketStatusValue | null>(null);
  const [bulkTagId, setBulkTagId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    displayTickets.length > 0 &&
    displayTickets.every((ticket) => selectedSet.has(ticket.id));
  const canSelectTickets = canBulkDelete || canBulkUpdateStatus;
  const emptyStateColumnCount =
    (canSelectTickets ? 8 : 7) + (canBulkUpdateStatus ? 1 : 0);
  const selectedCount = selectedIds.length;
  const bulkAssignee = bulkAssignedToId
    ? agents.find((agent) => agent.id === bulkAssignedToId) ?? null
    : null;
  const bulkTag = bulkTagId
    ? tags.find((tag) => tag.id === bulkTagId) ?? null
    : null;
  const hasBulkUpdates =
    Boolean(bulkStatus) ||
    Boolean(bulkPriority) ||
    bulkAssignedToId !== null ||
    Boolean(bulkTag);

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
    setBulkAssignedToId(null);
    setBulkPriority(null);
    setBulkStatus(null);
    setBulkTagId(null);
  }

  function selectedFormData() {
    const formData = new FormData();

    for (const ticketId of selectedIds) {
      formData.append("ticketIds", ticketId);
    }

    return formData;
  }

  function ticketFormData(ticketId: string) {
    const formData = new FormData();
    formData.set("ticketId", ticketId);
    return formData;
  }

  function clearBulkUpdates() {
    setBulkAssignedToId(null);
    setBulkPriority(null);
    setBulkStatus(null);
    setBulkTagId(null);
  }

  function runBulkUpdateApply() {
    if (!hasBulkUpdates) {
      toast({
        variant: "destructive",
        title: "Choose an update",
        description: "Select at least one bulk update before applying.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const messages: string[] = [];

        if (bulkStatus) {
          const formData = selectedFormData();
          formData.set("status", bulkStatus);
          const result = await bulkUpdateTicketStatus(formData);
          messages.push(result.message);
        }

        if (bulkPriority) {
          const formData = selectedFormData();
          formData.set("priority", bulkPriority);
          const result = await bulkUpdateTicketPriority(formData);
          messages.push(result.message);
        }

        if (bulkAssignedToId !== null) {
          const formData = selectedFormData();
          formData.set(
            "assignedToId",
            bulkAssignedToId === unassignedAssigneeValue ? "" : bulkAssignedToId,
          );
          const result = await bulkUpdateTicketAssignment(formData);
          messages.push(result.message);
        }

        if (bulkTag) {
          const formData = selectedFormData();
          formData.set("tagId", bulkTag.id);
          const result = await bulkAddTicketTag(formData);
          messages.push(result.message);
        }

        toast({
          variant: "success",
          title: "Tickets updated",
          description: messages.join(" "),
        });
        setDisplayTickets((current) =>
          current.flatMap((ticket) => {
            if (!selectedSet.has(ticket.id)) {
              return [ticket];
            }

            if (bulkStatus && !shouldKeepTicketAfterStatusChange(bulkStatus)) {
              return [];
            }

            const nextTicket = {
              ...ticket,
              assignedTo:
                bulkAssignedToId === null
                  ? ticket.assignedTo
                  : bulkAssignedToId === unassignedAssigneeValue
                    ? null
                    : bulkAssignee,
              priority: bulkPriority ?? ticket.priority,
              status: bulkStatus ?? ticket.status,
              tagLinks:
                bulkTag && !ticket.tagLinks.some((link) => link.tagId === bulkTag.id)
                  ? [
                      ...ticket.tagLinks,
                      {
                        tag: bulkTag,
                        tagId: bulkTag.id,
                      },
                    ].sort((a, b) => a.tag.name.localeCompare(b.tag.name))
                  : ticket.tagLinks,
              updatedAt: new Date(),
            };

            return [nextTicket];
          }),
        );
        clearSelection();
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
        clearSelection();
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

  function runMarkUnread(ticketId: string) {
    startTransition(async () => {
      try {
        const result = await markTicketUnread(ticketFormData(ticketId));

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  hasNewCustomerResponse: true,
                }
              : ticket,
          ),
        );
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description:
            error instanceof Error ? error.message : "Ticket was not updated.",
        });
      }
    });
  }

  function runTicketStatusUpdate(
    ticket: TicketBulkTableTicket,
    nextStatus: TicketStatusValue,
  ) {
    if (ticket.status === nextStatus) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData(ticket.id);
        formData.set("status", nextStatus);
        const result = await updateTicketStatus(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.flatMap((currentTicket) => {
            if (currentTicket.id !== ticket.id) {
              return [currentTicket];
            }

            if (!shouldKeepTicketAfterStatusChange(nextStatus)) {
              return [];
            }

            return [
              {
                ...currentTicket,
                status: nextStatus,
                updatedAt: new Date(),
              },
            ];
          }),
        );
        setSelectedIds((current) =>
          shouldKeepTicketAfterStatusChange(nextStatus)
            ? current
            : current.filter((ticketId) => ticketId !== ticket.id),
        );
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Status update failed",
          description:
            error instanceof Error
              ? error.message
              : "Ticket status was not updated.",
        });
      }
    });
  }

  function runTicketPriorityUpdate(
    ticket: TicketBulkTableTicket,
    nextPriority: TicketPriorityValue,
  ) {
    if (ticket.priority === nextPriority) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData(ticket.id);
        formData.set("priority", nextPriority);
        const result = await updateTicketPriority(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.map((currentTicket) =>
            currentTicket.id === ticket.id
              ? {
                  ...currentTicket,
                  priority: nextPriority,
                  updatedAt: new Date(),
                }
              : currentTicket,
          ),
        );
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Priority update failed",
          description:
            error instanceof Error
              ? error.message
              : "Ticket priority was not updated.",
        });
      }
    });
  }

  function runTicketAssignmentUpdate(
    ticket: TicketBulkTableTicket,
    nextAssignedToValue: string,
  ) {
    const currentAssignedToValue =
      ticket.assignedTo?.id ?? unassignedAssigneeValue;

    if (currentAssignedToValue === nextAssignedToValue) {
      return;
    }

    startTransition(async () => {
      try {
        const nextAssignedToId =
          nextAssignedToValue === unassignedAssigneeValue
            ? ""
            : nextAssignedToValue;
        const formData = ticketFormData(ticket.id);
        formData.set("assignedToId", nextAssignedToId);
        const result = await updateTicketAssignment(formData);
        const nextAssignee =
          nextAssignedToValue === unassignedAssigneeValue
            ? null
            : agents.find((agent) => agent.id === nextAssignedToValue) ?? null;

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.map((currentTicket) =>
            currentTicket.id === ticket.id
              ? {
                  ...currentTicket,
                  assignedTo: nextAssignee,
                  updatedAt: new Date(),
                }
              : currentTicket,
          ),
        );
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Assignment update failed",
          description:
            error instanceof Error
              ? error.message
              : "Ticket assignment was not updated.",
        });
      }
    });
  }

  function runTicketTagAdd(ticket: TicketBulkTableTicket, tag: TicketBulkTableTag) {
    if (ticket.tagLinks.some((link) => link.tagId === tag.id)) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData(ticket.id);
        formData.set("tagName", tag.name);
        const result = await addTicketTag(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setDisplayTickets((current) =>
          current.map((currentTicket) =>
            currentTicket.id === ticket.id
              ? {
                  ...currentTicket,
                  tagLinks: [
                    ...currentTicket.tagLinks,
                    {
                      tag,
                      tagId: tag.id,
                    },
                  ].sort((a, b) => a.tag.name.localeCompare(b.tag.name)),
                }
              : currentTicket,
          ),
        );
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Tag update failed",
          description:
            error instanceof Error ? error.message : "Ticket tag was not added.",
        });
      }
    });
  }

  function getTicketDisplayData(ticket: TicketBulkTableTicket) {
    const assigneeName =
      ticket.assignedTo?.name ?? ticket.assignedTo?.email ?? "Unassigned";
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

    return {
      agingState,
      assigneeName,
      customerName,
    };
  }

  function getTicketHref(ticketId: string) {
    return `/tickets/${ticketId}?from=${encodeURIComponent(returnHref)}`;
  }

  function renderTicketTags(ticket: TicketBulkTableTicket) {
    if (ticket.tagLinks.length === 0) {
      return null;
    }

    return (
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
        {ticket.tagLinks.map((link) => (
          <Badge
            key={link.tagId}
            variant="outline"
            className="max-w-[180px] shrink-0 truncate bg-background text-xs font-normal text-muted-foreground"
          >
            {link.tag.name}
          </Badge>
        ))}
      </div>
    );
  }

  function renderTicketActions(ticket: TicketBulkTableTicket) {
    if (!canBulkUpdateStatus) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={`Actions for ticket #${ticket.number}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-72 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={isPending || ticket.hasNewCustomerResponse}
              onSelect={() => runMarkUnread(ticket.id)}
            >
              Mark as unread
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change status</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={ticket.status}
            onValueChange={(value) =>
              runTicketStatusUpdate(ticket, value as TicketStatusValue)
            }
          >
            {Object.values(TicketStatus).map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {statusLabels[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change priority</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={ticket.priority}
            onValueChange={(value) =>
              runTicketPriorityUpdate(ticket, value as TicketPriorityValue)
            }
          >
            {Object.values(TicketPriority).map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {priorityLabels[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={ticket.assignedTo?.id ?? unassignedAssigneeValue}
            onValueChange={(value) => runTicketAssignmentUpdate(ticket, value)}
          >
            <DropdownMenuRadioItem value={unassignedAssigneeValue}>
              Unassigned
            </DropdownMenuRadioItem>
            {agents.map((agent) => (
              <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                {agent.name ?? agent.email}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Add tag</DropdownMenuLabel>
          <DropdownMenuGroup>
            {tags.length === 0 ? (
              <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
            ) : (
              tags.map((tag) => {
                const hasTag = ticket.tagLinks.some(
                  (link) => link.tagId === tag.id,
                );

                return (
                  <DropdownMenuItem
                    key={tag.id}
                    disabled={isPending || hasTag}
                    onSelect={() => runTicketTagAdd(ticket, tag)}
                  >
                    {tag.name}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      {canSelectTickets && selectedCount > 0 ? (
        <div className="border-b border-zinc-200 bg-cyan-50/70 px-4 py-3 text-sm">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <Badge variant="secondary" className="shrink-0 bg-white">
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
            {canBulkUpdateStatus ? (
              <Separator
                orientation="vertical"
                className="hidden h-7 bg-zinc-300 xl:block"
              />
            ) : null}
            {canBulkUpdateStatus ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  Bulk update
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="max-w-[210px] justify-start bg-white"
                    >
                      <span className="truncate">
                        {bulkStatus
                          ? `Status: ${statusLabels[bulkStatus]}`
                          : "Status"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuGroup>
                      {Object.values(TicketStatus).map((option) => (
                        <DropdownMenuItem
                          key={option}
                          onSelect={() => setBulkStatus(option)}
                        >
                          {statusLabels[option]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="max-w-[190px] justify-start bg-white"
                    >
                      <span className="truncate">
                        {bulkPriority
                          ? `Priority: ${priorityLabels[bulkPriority]}`
                          : "Priority"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuGroup>
                      {Object.values(TicketPriority).map((option) => (
                        <DropdownMenuItem
                          key={option}
                          onSelect={() => setBulkPriority(option)}
                        >
                          {priorityLabels[option]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      className="max-w-[240px] justify-start bg-white"
                    >
                      <span className="truncate">
                        {bulkAssignedToId === null
                          ? "Assignee"
                          : bulkAssignedToId === unassignedAssigneeValue
                            ? "Assignee: Unassigned"
                            : `Assignee: ${bulkAssignee?.name ?? bulkAssignee?.email ?? "Selected"}`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        onSelect={() =>
                          setBulkAssignedToId(unassignedAssigneeValue)
                        }
                      >
                        Unassigned
                      </DropdownMenuItem>
                      {agents.map((agent) => (
                        <DropdownMenuItem
                          key={agent.id}
                          onSelect={() => setBulkAssignedToId(agent.id)}
                        >
                          {agent.name ?? agent.email}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending || tags.length === 0}
                      className="max-w-[220px] justify-start bg-white"
                    >
                      <span className="truncate">
                        {bulkTag ? `Tag: ${bulkTag.name}` : "Tag"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuGroup>
                      {tags.length === 0 ? (
                        <DropdownMenuItem disabled>
                          No tags available
                        </DropdownMenuItem>
                      ) : (
                        tags.map((tag) => (
                          <DropdownMenuItem
                            key={tag.id}
                            onSelect={() => setBulkTagId(tag.id)}
                          >
                            {tag.name}
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !hasBulkUpdates}
                  onClick={runBulkUpdateApply}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending || !hasBulkUpdates}
                  onClick={clearBulkUpdates}
                >
                  Reset
                </Button>
              </div>
            ) : null}
            {canBulkDelete ? (
              <div className="flex shrink-0 items-center">
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
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-zinc-200 lg:hidden">
        {displayTickets.map((ticket) => {
          const { agingState, customerName } = getTicketDisplayData(ticket);

          return (
            <div
              key={ticket.id}
              className={cn(
                "flex min-w-0 gap-3 px-3 py-3",
                ticket.hasNewCustomerResponse && "bg-cyan-50/60",
              )}
            >
              {canSelectTickets ? (
                <div className="pt-1">
                  <input
                    aria-label={`Select ticket #${ticket.number}`}
                    checked={selectedSet.has(ticket.id)}
                    type="checkbox"
                    onChange={(event) =>
                      setTicketSelected(ticket.id, event.target.checked)
                    }
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={getTicketHref(ticket.id)}
                      className="shrink-0 text-xs font-medium text-muted-foreground hover:text-zinc-950 hover:underline"
                    >
                      #{ticket.number}
                    </Link>
                    {ticket._count.attachments > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="size-3" />
                        {ticket._count.attachments}
                      </span>
                    ) : null}
                    {ticket.hasNewCustomerResponse ? (
                      <Badge
                        variant="outline"
                        className="border-cyan-200 bg-cyan-100 text-cyan-800"
                      >
                        New
                      </Badge>
                    ) : null}
                  </div>
                  {renderTicketActions(ticket)}
                </div>
                <Link
                  href={getTicketHref(ticket.id)}
                  className={cn(
                    "block break-words text-base leading-snug text-zinc-950 hover:underline [overflow-wrap:anywhere]",
                    ticket.hasNewCustomerResponse
                      ? "font-bold"
                      : "font-semibold",
                  )}
                >
                  {ticket.subject}
                </Link>
                {renderTicketTags(ticket)}
                <div className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {customerName}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className={statusStyles[ticket.status]}
                  >
                    {statusLabels[ticket.status]}
                  </Badge>
                  <span className={priorityStyles[ticket.priority]}>
                    {priorityLabels[ticket.priority]}
                  </span>
                  <span>
                    Customer{" "}
                    {formatOptionalRelativeTime(
                      ticket.lastCustomerMessageAt,
                      renderedAt,
                    )}
                  </span>
                  <span>
                    Update {formatRelativeTime(ticket.updatedAt, renderedAt)}
                  </span>
                </div>
                {agingState ? (
                  <div className="mt-2">
                    <Badge
                      variant="outline"
                      className={getTicketAgingClass(agingState.severity)}
                    >
                      {agingState.label} · {agingState.ageLabel}
                    </Badge>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {displayTickets.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            {hasFilters
              ? "No tickets match the current filters."
              : "No tickets yet. Run pnpm db:seed to add sample data."}
          </div>
        ) : null}
      </div>
      <div className="hidden min-w-0 overflow-x-auto lg:block">
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
              <TableHead className="hidden w-[220px] 2xl:table-cell">
                Customer
              </TableHead>
              <TableHead className="hidden w-[150px] lg:table-cell">
                <div className="flex items-center gap-1">
                  Status
                  <StatusDefinitionsMenu />
                </div>
              </TableHead>
              <TableHead className="hidden w-[90px] 2xl:table-cell">
                Priority
              </TableHead>
              <TableHead className="hidden w-[150px] 2xl:table-cell">
                Assignee
              </TableHead>
              <TableHead className="w-[170px] text-right">Activity</TableHead>
              {canBulkUpdateStatus ? (
                <TableHead className="w-[70px] pr-5 text-right">Actions</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayTickets.map((ticket) => {
              const { agingState, assigneeName, customerName } =
                getTicketDisplayData(ticket);

              return (
                <TableRow
                  key={ticket.id}
                  className={
                    ticket.hasNewCustomerResponse
                      ? "bg-cyan-50/60 hover:bg-cyan-50"
                      : "hover:bg-zinc-50/80"
                  }
                >
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
                  <TableCell
                    className={cn(
                      "whitespace-nowrap",
                      ticket.hasNewCustomerResponse
                        ? "font-semibold text-zinc-950"
                        : "font-medium text-zinc-500",
                    )}
                  >
                    <Link
                      href={getTicketHref(ticket.id)}
                      className="hover:text-zinc-950 hover:underline"
                    >
                      #{ticket.number}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-0 whitespace-normal">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0">
                        <Link
                          href={getTicketHref(ticket.id)}
                          className={cn(
                            "line-clamp-2 break-words text-zinc-950 hover:underline [overflow-wrap:anywhere]",
                            ticket.hasNewCustomerResponse
                              ? "font-semibold"
                              : "font-medium",
                          )}
                        >
                          {ticket.subject}
                        </Link>
                        {renderTicketTags(ticket)}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground 2xl:hidden">
                          <span className="break-words [overflow-wrap:anywhere]">
                            {customerName}
                          </span>
                          <span className={priorityStyles[ticket.priority]}>
                            {priorityLabels[ticket.priority]}
                          </span>
                          <span className="break-words [overflow-wrap:anywhere]">
                            {assigneeName}
                          </span>
                        </div>
                      </div>
                      {ticket._count.attachments > 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" />
                          {ticket._count.attachments}
                        </span>
                      ) : null}
                      {ticket.hasNewCustomerResponse ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-cyan-200 bg-cyan-100 text-cyan-800"
                        >
                          New
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal break-words [overflow-wrap:anywhere] 2xl:table-cell">
                    {customerName}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant="outline"
                      className={statusStyles[ticket.status]}
                    >
                      {statusLabels[ticket.status]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`hidden 2xl:table-cell ${priorityStyles[ticket.priority]}`}
                  >
                    {priorityLabels[ticket.priority]}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal break-words [overflow-wrap:anywhere] 2xl:table-cell">
                    {assigneeName}
                  </TableCell>
                  <TableCell className="w-[170px] whitespace-nowrap text-right text-muted-foreground">
                    <div className="text-xs">
                      Customer{" "}
                      {formatOptionalRelativeTime(
                        ticket.lastCustomerMessageAt,
                        renderedAt,
                      )}
                    </div>
                    <div className="text-xs">
                      Agent{" "}
                      {formatOptionalRelativeTime(
                        ticket.lastAgentMessageAt,
                        renderedAt,
                      )}
                    </div>
                    <div className="text-xs">
                      Update {formatRelativeTime(ticket.updatedAt, renderedAt)}
                    </div>
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
                  {canBulkUpdateStatus ? (
                    <TableCell className="pr-5 text-right">
                      {renderTicketActions(ticket)}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
            {displayTickets.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={emptyStateColumnCount}
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
