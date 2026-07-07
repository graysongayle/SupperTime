"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

import { deleteSupportForm } from "@/app/(app)/support-forms/actions";
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

type DeleteSupportFormButtonProps = {
  formId: string;
  formName: string;
  ticketCount: number;
};

export function DeleteSupportFormButton({
  formId,
  formName,
  ticketCount,
}: DeleteSupportFormButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("formId", formId);

        const result = await deleteSupportForm(formData);

        toast({
          variant: "success",
          title: "Support form deleted",
          description: result.message,
        });
        setIsOpen(false);
        router.refresh();
      } catch (error) {
        setIsOpen(false);
        toast({
          variant: "destructive",
          title: "Delete failed",
          description:
            error instanceof Error
              ? error.message
              : "The support form was not deleted.",
        });
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={isPending}>
          Delete form
        </Button>
      </DialogTrigger>
      <DialogContent className="border-red-200">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle />
          </div>
          <DialogTitle>Delete support form?</DialogTitle>
          <DialogDescription>
            This will permanently delete "{formName}". Embedded scripts using
            this form will stop loading it.
          </DialogDescription>
        </DialogHeader>
        {ticketCount > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            This form has created {ticketCount}{" "}
            {ticketCount === 1 ? "ticket" : "tickets"}. Those tickets will be
            kept, but they will no longer be linked to this form.
          </div>
        ) : null}
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
            Delete form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
