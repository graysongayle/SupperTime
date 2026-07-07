"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  updateTicketAssignment,
  updateTicketPriority,
  updateTicketStatus,
} from "@/app/(app)/tickets/actions";
import { StatusDefinitionsMenu } from "@/components/app/status-definitions-menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { TicketPriority, TicketStatus } from "@/generated/prisma/enums";

const statusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

const priorityLabels = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};

type TicketPropertiesFormProps = {
  agents: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  assignedToId: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  ticketId: string;
};

export function TicketPropertiesForm({
  agents,
  assignedToId,
  priority,
  status,
  ticketId,
}: TicketPropertiesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submitAction(
    action: (formData: FormData) => Promise<{ ok: boolean; message: string }>,
    formData: FormData,
    fallbackMessage: string,
  ) {
    startTransition(async () => {
      try {
        const result = await action(formData);

        toast({
          variant: "success",
          title: "Saved",
          description: result.message || fallbackMessage,
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description:
            error instanceof Error ? error.message : "The ticket was not updated.",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        action={(formData) =>
          submitAction(updateTicketStatus, formData, "Ticket status updated.")
        }
        className="space-y-2"
      >
        <input type="hidden" name="ticketId" value={ticketId} />
        <div className="flex items-center gap-1">
          <label className="text-sm font-medium">Status</label>
          <StatusDefinitionsMenu />
        </div>
        <div className="flex gap-2">
          <select
            name="status"
            defaultValue={status}
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            {Object.values(TicketStatus).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
        </div>
      </form>

      <form
        action={(formData) =>
          submitAction(updateTicketPriority, formData, "Ticket priority updated.")
        }
        className="space-y-2"
      >
        <input type="hidden" name="ticketId" value={ticketId} />
        <label className="text-sm font-medium">Priority</label>
        <div className="flex gap-2">
          <select
            name="priority"
            defaultValue={priority}
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            {Object.values(TicketPriority).map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
        </div>
      </form>

      <form
        action={(formData) =>
          submitAction(updateTicketAssignment, formData, "Ticket assignee updated.")
        }
        className="space-y-2"
      >
        <input type="hidden" name="ticketId" value={ticketId} />
        <label className="text-sm font-medium">Assignee</label>
        <div className="flex gap-2">
          <select
            name="assignedToId"
            defaultValue={assignedToId ?? ""}
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name ?? agent.email}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={isPending}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
