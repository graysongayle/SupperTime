"use client";

import { useEffect, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  addTicketTag,
  markTicketUnread,
  updateTicketAssignment,
  updateTicketPriority,
  updateTicketStatus,
} from "@/app/(app)/tickets/actions";
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
import { toast } from "@/hooks/use-toast";
import {
  TicketPriority,
  TicketStatus,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";

const statusLabels: Record<TicketStatusValue, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

const priorityLabels: Record<TicketPriorityValue, string> = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};
const unassignedAssigneeValue = "unassigned";

type TicketPropertiesMenuAgent = {
  email: string;
  id: string;
  name: string | null;
};

type TicketPropertiesMenuTag = {
  id: string;
  name: string;
};

type TicketPropertiesMenuProps = {
  agents: TicketPropertiesMenuAgent[];
  assignedToId: string | null;
  hasNewCustomerResponse?: boolean;
  priority: TicketPriorityValue;
  markUnreadReturnHref?: string;
  status: TicketStatusValue;
  tagLinks: Array<{
    tagId: string;
  }>;
  tags: TicketPropertiesMenuTag[];
  ticketId: string;
  ticketNumber: number;
};

export function TicketPropertiesMenu({
  agents,
  assignedToId,
  hasNewCustomerResponse = false,
  markUnreadReturnHref,
  priority,
  status,
  tagLinks,
  tags,
  ticketId,
  ticketNumber,
}: TicketPropertiesMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentAssignedToId, setCurrentAssignedToId] = useState(
    assignedToId ?? unassignedAssigneeValue,
  );
  const [currentHasNewCustomerResponse, setCurrentHasNewCustomerResponse] =
    useState(hasNewCustomerResponse);
  const [currentPriority, setCurrentPriority] =
    useState<TicketPriorityValue>(priority);
  const [currentStatus, setCurrentStatus] = useState<TicketStatusValue>(status);
  const [currentTagIds, setCurrentTagIds] = useState(
    tagLinks.map((link) => link.tagId),
  );

  useEffect(() => {
    setCurrentAssignedToId(assignedToId ?? unassignedAssigneeValue);
  }, [assignedToId]);

  useEffect(() => {
    setCurrentHasNewCustomerResponse(hasNewCustomerResponse);
  }, [hasNewCustomerResponse]);

  useEffect(() => {
    setCurrentPriority(priority);
  }, [priority]);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  useEffect(() => {
    setCurrentTagIds(tagLinks.map((link) => link.tagId));
  }, [tagLinks]);

  function ticketFormData() {
    const formData = new FormData();
    formData.set("ticketId", ticketId);
    return formData;
  }

  function runMarkUnread() {
    startTransition(async () => {
      try {
        const result = await markTicketUnread(ticketFormData());

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setCurrentHasNewCustomerResponse(true);

        if (markUnreadReturnHref) {
          router.push(markUnreadReturnHref);
        } else {
          router.refresh();
        }
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

  function runStatusUpdate(nextStatus: TicketStatusValue) {
    if (currentStatus === nextStatus) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData();
        formData.set("status", nextStatus);
        const result = await updateTicketStatus(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setCurrentStatus(nextStatus);
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

  function runPriorityUpdate(nextPriority: TicketPriorityValue) {
    if (currentPriority === nextPriority) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData();
        formData.set("priority", nextPriority);
        const result = await updateTicketPriority(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setCurrentPriority(nextPriority);
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

  function runAssignmentUpdate(nextAssignedToValue: string) {
    if (currentAssignedToId === nextAssignedToValue) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData();
        formData.set(
          "assignedToId",
          nextAssignedToValue === unassignedAssigneeValue
            ? ""
            : nextAssignedToValue,
        );
        const result = await updateTicketAssignment(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setCurrentAssignedToId(nextAssignedToValue);
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

  function runTagAdd(tag: TicketPropertiesMenuTag) {
    if (currentTagIds.includes(tag.id)) {
      return;
    }

    startTransition(async () => {
      try {
        const formData = ticketFormData();
        formData.set("tagName", tag.name);
        const result = await addTicketTag(formData);

        toast({
          variant: "success",
          title: "Ticket updated",
          description: result.message,
        });
        setCurrentTagIds((current) => [...current, tag.id]);
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isPending}
          aria-label={`Actions for ticket #${ticketNumber}`}
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
            disabled={isPending || currentHasNewCustomerResponse}
            onSelect={runMarkUnread}
          >
            Mark as unread
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Change status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentStatus}
          onValueChange={(value) => runStatusUpdate(value as TicketStatusValue)}
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
          value={currentPriority}
          onValueChange={(value) =>
            runPriorityUpdate(value as TicketPriorityValue)
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
          value={currentAssignedToId}
          onValueChange={runAssignmentUpdate}
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
              const hasTag = currentTagIds.includes(tag.id);

              return (
                <DropdownMenuItem
                  key={tag.id}
                  disabled={isPending || hasTag}
                  onSelect={() => runTagAdd(tag)}
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
