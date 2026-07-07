"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

import { deleteClosedTicket } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type DeleteTicketFormProps = {
  ticketId: string;
  ticketNumber: number;
};

export function DeleteTicketForm({
  ticketId,
  ticketNumber,
}: DeleteTicketFormProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canDelete = confirmation === "DELETE";

  function confirmDelete() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("ticketId", ticketId);
        const result = await deleteClosedTicket(formData);

        toast({
          variant: "success",
          title: "Ticket deleted",
          description: result.message,
        });
        setIsOpen(false);
        router.push("/tickets");
      } catch (error) {
        setIsOpen(false);
        toast({
          variant: "destructive",
          title: "Delete failed",
          description:
            error instanceof Error
              ? error.message
              : "The ticket was not deleted.",
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor="delete-confirmation"
          className="text-sm font-medium text-zinc-950"
        >
          Type DELETE to permanently delete ticket #{ticketNumber}
        </label>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="h-9 w-full rounded-lg border border-red-200 bg-white px-3 text-sm shadow-xs outline-none focus:border-red-500"
          autoComplete="off"
        />
      </div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={!canDelete || isPending}
          >
            Permanently delete ticket
          </Button>
        </DialogTrigger>
        <DialogContent className="border-red-200">
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>Permanently delete ticket #{ticketNumber}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The ticket and its related messages,
              participants, attachments, tags, and status history will be removed
              from the database.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            Only closed tickets can be deleted, and this operation is restricted
            to super-admins.
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
