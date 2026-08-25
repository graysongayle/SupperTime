"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { updateTicketProperties } from "@/app/(app)/tickets/actions";
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
  const [currentAssignedToId, setCurrentAssignedToId] = useState(
    assignedToId ?? "",
  );
  const [currentPriority, setCurrentPriority] = useState(priority);
  const [currentStatus, setCurrentStatus] = useState(status);

  useEffect(() => {
    setCurrentAssignedToId(assignedToId ?? "");
  }, [assignedToId]);

  useEffect(() => {
    setCurrentPriority(priority);
  }, [priority]);

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  const hasChanges =
    currentAssignedToId !== (assignedToId ?? "") ||
    currentPriority !== priority ||
    currentStatus !== status;

  function submitAction(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await updateTicketProperties(formData);

        toast({
          variant: "success",
          title: "Saved",
          description: result.message || "Ticket properties updated.",
        });
        router.refresh();
      } catch (error) {
        setCurrentAssignedToId(assignedToId ?? "");
        setCurrentPriority(priority);
        setCurrentStatus(status);
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
    <form action={submitAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <div className="flex items-center gap-1">
          <label className="text-sm font-medium">Status</label>
          <StatusDefinitionsMenu />
        </div>
        <div className="flex gap-2">
          <select
            name="status"
            value={currentStatus}
            onChange={(event) =>
              setCurrentStatus(event.target.value as TicketStatus)
            }
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            {Object.values(TicketStatus).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Priority</label>
        <div className="flex gap-2">
          <select
            name="priority"
            value={currentPriority}
            onChange={(event) =>
              setCurrentPriority(event.target.value as TicketPriority)
            }
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            {Object.values(TicketPriority).map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Assignee</label>
        <div className="flex gap-2">
          <select
            name="assignedToId"
            value={currentAssignedToId}
            onChange={(event) => setCurrentAssignedToId(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
          >
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name ?? agent.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" size="sm" disabled={isPending || !hasChanges}>
        Save
      </Button>
    </form>
  );
}
