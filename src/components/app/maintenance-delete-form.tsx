"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

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

type MaintenanceDeleteFormProps = {
  action: (formData: FormData) => Promise<{ ok: boolean; message: string }>;
  confirmation: string;
  description: string;
  hiddenFields?: Record<string, string>;
  title: string;
  triggerLabel: string;
};

export function MaintenanceDeleteForm({
  action,
  confirmation,
  description,
  hiddenFields,
  title,
  triggerLabel,
}: MaintenanceDeleteFormProps) {
  const router = useRouter();
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canSubmit = typedConfirmation === confirmation;

  function runAction() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("confirmation", typedConfirmation);

        for (const [key, value] of Object.entries(hiddenFields ?? {})) {
          formData.set(key, value);
        }

        const result = await action(formData);

        toast({
          variant: "success",
          title: "Deleted",
          description: result.message,
        });
        setIsOpen(false);
        setTypedConfirmation("");
        router.refresh();
      } catch (error) {
        setIsOpen(false);
        toast({
          variant: "destructive",
          title: "Delete failed",
          description:
            error instanceof Error ? error.message : "The delete action failed.",
        });
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        Type {confirmation}
      </label>
      <input
        value={typedConfirmation}
        onChange={(event) => setTypedConfirmation(event.target.value)}
        className="h-9 w-full rounded-lg border border-red-200 bg-white px-3 text-sm shadow-xs outline-none focus:border-red-500"
        autoComplete="off"
      />
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit || isPending}
          >
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="border-red-200">
          <DialogHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            This operation cannot be undone.
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
              onClick={runAction}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
