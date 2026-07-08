"use client";

import { Clipboard, Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addPublicReply } from "@/app/(app)/tickets/actions";
import {
  formatAttachmentLimit,
  maxAttachmentCount,
} from "@/lib/attachment-limits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type TicketReplyFormProps = {
  ccParticipants: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  replyRecipientLabel: string;
  replyRecipientName: string;
  ticketId: string;
};

function fileKey(file: File) {
  return [file.name, file.type, file.size, file.lastModified].join(":");
}

function normalizedImageFile(file: File) {
  if (file.name) {
    return file;
  }

  const extension = file.type === "image/jpeg" ? "jpg" : "png";
  return new File([file], `pasted-image-${Date.now()}.${extension}`, {
    type: file.type || "image/png",
  });
}

export function TicketReplyForm({
  ccParticipants,
  replyRecipientLabel,
  replyRecipientName,
  ticketId,
}: TicketReplyFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();

  function addAttachments(files: File[]) {
    if (attachments.length + files.length > maxAttachmentCount) {
      toast({
        variant: "destructive",
        title: "Attachment limit reached",
        description: `Attach up to ${maxAttachmentCount} files per reply.`,
      });
    }

    setAttachments((current) => {
      const existingKeys = new Set(current.map(fileKey));
      const next = [...current];

      for (const file of files) {
        const key = fileKey(file);

        if (!existingKeys.has(key)) {
          next.push(file);
          existingKeys.add(key);
        }
      }

      return next.slice(0, maxAttachmentCount);
    });
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    addAttachments(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.files)
      .filter((file) => file.type.startsWith("image/"))
      .map(normalizedImageFile);

    if (imageFiles.length === 0) {
      return;
    }

    addAttachments(imageFiles);
    toast({
      variant: "success",
      title: imageFiles.length === 1 ? "Image attached" : "Images attached",
      description: "The pasted image will be sent with your reply.",
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("attachments");

    for (const attachment of attachments) {
      formData.append("attachments", attachment);
    }

    startTransition(async () => {
      try {
        await addPublicReply(formData);
        setAttachments([]);
        form.reset();
        toast({
          variant: "success",
          title: "Reply sent",
          description: "Your response was sent to the customer.",
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Reply failed",
          description:
            error instanceof Error ? error.message : "The reply was not sent.",
        });
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3"
      encType="multipart/form-data"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm">
        <div className="font-medium text-cyan-950">
          To: {replyRecipientLabel}
        </div>
        <div className="mt-1 text-xs text-cyan-900/80">
          This reply will be sent to {replyRecipientName}. Add CC recipients
          below if other participants should receive it.
        </div>
      </div>
      <Textarea
        name="body"
        required
        rows={6}
        placeholder="Write a customer-facing reply."
        onPaste={handlePaste}
      />
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="replyAttachments"
            className="text-sm font-medium text-zinc-950"
          >
            Attach files
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
            Choose files
          </Button>
        </div>
        <input
          ref={fileInputRef}
          id="replyAttachments"
          name="attachments"
          type="file"
          multiple
          className="sr-only"
          onChange={handleFileInputChange}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clipboard className="size-3.5" />
          Paste screenshots into the reply box, or attach up to{" "}
          {maxAttachmentCount} files and {formatAttachmentLimit()} total.
        </p>
        {attachments.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={fileKey(attachment)}
                className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div>
          <div className="text-sm font-medium text-zinc-950">CC recipients</div>
          <div className="text-xs text-muted-foreground">
            Select existing CC participants or add email addresses for this
            reply.
          </div>
        </div>
        {ccParticipants.length > 0 ? (
          <div className="space-y-2">
            {ccParticipants.map((participant) => (
              <label
                key={participant.id}
                className="flex items-start gap-2 text-sm text-zinc-700"
              >
                <input
                  type="checkbox"
                  name="ccParticipantId"
                  value={participant.id}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-900">
                    {participant.name ?? participant.email}
                  </span>
                  <span className="block break-words text-xs text-muted-foreground">
                    {participant.email}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No CC participants are currently listed on this ticket.
          </div>
        )}
        <div className="space-y-1">
          <label
            htmlFor="additionalCc"
            className="text-sm font-medium text-zinc-900"
          >
            Add CC addresses
          </label>
          <input
            id="additionalCc"
            name="additionalCc"
            type="text"
            placeholder="name@example.com, other@example.com"
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-xs outline-none focus:border-cyan-600"
          />
          <p className="text-xs text-muted-foreground">
            Separate multiple addresses with commas, semicolons, or spaces.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-zinc-900 text-white hover:bg-zinc-800"
        >
          Send reply
        </Button>
      </div>
    </form>
  );
}
