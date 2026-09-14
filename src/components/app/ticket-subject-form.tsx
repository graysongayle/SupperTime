"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { updateTicketSubject } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

type TicketSubjectFormProps = {
  subject: string;
  ticketId: string;
};

export function TicketSubjectForm({
  subject,
  ticketId,
}: TicketSubjectFormProps) {
  const router = useRouter();
  const [currentSubject, setCurrentSubject] = useState(subject);
  const [draftSubject, setDraftSubject] = useState(subject);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const trimmedDraftSubject = draftSubject.trim();
  const hasChanges = trimmedDraftSubject !== currentSubject;
  const canSave = hasChanges && trimmedDraftSubject.length > 0;

  useEffect(() => {
    setCurrentSubject(subject);
    setDraftSubject(subject);
    setIsEditing(false);
  }, [subject]);

  function cancelEdit() {
    setDraftSubject(currentSubject);
    setIsEditing(false);
  }

  function submitAction(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await updateTicketSubject(formData);

        toast({
          variant: "success",
          title: "Saved",
          description: result.message,
        });
        setCurrentSubject(trimmedDraftSubject);
        setDraftSubject(trimmedDraftSubject);
        setIsEditing(false);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description:
            error instanceof Error ? error.message : "The title was not updated.",
        });
      }
    });
  }

  if (isEditing) {
    return (
      <form action={submitAction} className="flex max-w-4xl flex-col gap-2">
        <input type="hidden" name="ticketId" value={ticketId} />
        <Input
          autoFocus
          name="subject"
          value={draftSubject}
          onChange={(event) => setDraftSubject(event.target.value)}
          className="h-10 text-base font-semibold md:text-lg"
          aria-label="Ticket title"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={isPending || !canSave}>
            <Check data-icon="inline-start" />
            Save title
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={cancelEdit}
          >
            <X data-icon="inline-start" />
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="inline-flex max-w-full items-start gap-1.5">
      <h1 className="min-w-0 break-words text-2xl font-semibold tracking-normal text-zinc-950 [overflow-wrap:anywhere]">
        {currentSubject}
      </h1>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="mt-0.5 shrink-0"
        onClick={() => setIsEditing(true)}
        aria-label="Edit ticket title"
      >
        <Pencil />
      </Button>
    </div>
  );
}
