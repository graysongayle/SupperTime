"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Forward } from "lucide-react";

import { forwardTicket } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type TicketForwardSheetProps = {
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
};

const forwardModes = [
  {
    value: "link",
    label: "Ticket link only",
    description: "Send metadata and a link for someone with app access.",
  },
  {
    value: "latest_customer",
    label: "Latest customer response",
    description: "Send ticket metadata and the newest public customer message.",
  },
  {
    value: "public_thread",
    label: "Full public email thread",
    description:
      "Send the initial description plus every public customer and agent message. Internal notes are excluded.",
  },
];

export function TicketForwardSheet({
  ticketId,
  ticketNumber,
  ticketSubject,
}: TicketForwardSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await forwardTicket(formData);

        toast({
          variant: "success",
          title: "Forwarded",
          description: result.message,
        });
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Forward failed",
          description:
            error instanceof Error ? error.message : "The ticket was not forwarded.",
        });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="bg-white">
          <Forward className="size-4" />
          Forward
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-zinc-200">
          <SheetTitle>Forward ticket #{ticketNumber}</SheetTitle>
          <SheetDescription>{ticketSubject}</SheetDescription>
        </SheetHeader>
        <form action={submit} className="space-y-5 px-4 pb-4">
          <input type="hidden" name="ticketId" value={ticketId} />
          <label className="space-y-2 text-sm font-medium">
            To
            <input
              name="to"
              type="email"
              multiple
              required
              placeholder="name@example.com, teammate@example.com"
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Separate multiple recipients with commas.
            </span>
          </label>
          <label className="space-y-2 text-sm font-medium">
            Subject
            <input
              name="subject"
              defaultValue={`Fwd: Ticket #${ticketNumber} - ${ticketSubject}`}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Content</legend>
            <div className="space-y-2">
              {forwardModes.map((mode, index) => (
                <label
                  key={mode.value}
                  className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={mode.value}
                    defaultChecked={index === 0}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-zinc-950">
                      {mode.label}
                    </span>
                    <span className="text-muted-foreground">
                      {mode.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="space-y-2 text-sm font-medium">
            Note
            <Textarea
              name="note"
              rows={5}
              placeholder="Add context for the person receiving this forward."
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
            <Button
              type="button"
              variant="outline"
              className="bg-white"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              Forward ticket
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
