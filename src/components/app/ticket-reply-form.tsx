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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type TicketReplyFormProps = {
  ccParticipants: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  defaultCcEmails?: string[];
  defaultToEmails?: string[];
  onSent?: () => void;
  replyRecipientLabel: string;
  ticketId: string;
  toParticipants: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
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

function RecipientCheckbox({
  defaultChecked,
  description,
  label,
  name,
  value,
}: {
  defaultChecked?: boolean;
  description?: string;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block break-words font-medium text-zinc-950 [overflow-wrap:anywhere]">
          {label}
        </span>
        {description ? (
          <span className="block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function TicketReplyForm({
  ccParticipants,
  defaultCcEmails = [],
  defaultToEmails = [],
  onSent,
  replyRecipientLabel,
  ticketId,
  toParticipants,
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
          description: "Your response was sent to the selected recipients.",
        });
        onSent?.();
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
      className="flex flex-col gap-3"
      encType="multipart/form-data"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <div className="text-sm font-medium text-zinc-950">Recipients</div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[32px_minmax(0,1fr)]">
          <div className="pt-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
            To
          </div>
          <div className="flex flex-col gap-2">
            {defaultToEmails.length > 0 ? (
              defaultToEmails.map((email) => (
                <RecipientCheckbox
                  key={email}
                  defaultChecked
                  label={email}
                  name="toEmail"
                  value={email}
                />
              ))
            ) : (
              <div className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm">
                <input type="checkbox" checked readOnly disabled className="mt-1" />
                <span className="min-w-0">
                  <span className="block break-words font-medium text-zinc-950 [overflow-wrap:anywhere]">
                    {replyRecipientLabel}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Primary requester
                  </span>
                </span>
              </div>
            )}
            {toParticipants.map((participant) => (
              <RecipientCheckbox
                key={participant.id}
                description={participant.email}
                label={participant.name ?? participant.email}
                name="toParticipantId"
                value={participant.id}
              />
            ))}
          </div>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[32px_minmax(0,1fr)]">
          <div className="pt-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">
            Cc
          </div>
          <div className="flex flex-col gap-2">
            {defaultCcEmails.map((email) => (
              <RecipientCheckbox
                key={email}
                defaultChecked
                label={email}
                name="ccEmail"
                value={email}
              />
            ))}
            {ccParticipants.map((participant) => (
              <RecipientCheckbox
                key={participant.id}
                description={participant.email}
                label={participant.name ?? participant.email}
                name="ccParticipantId"
                value={participant.id}
              />
            ))}
            {defaultCcEmails.length === 0 && ccParticipants.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-200 bg-white px-2 py-1.5 text-sm text-muted-foreground">
                No Cc recipients are selected.
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <label
            htmlFor="additionalCc"
            className="text-sm font-medium text-zinc-950"
          >
            Add Cc addresses
          </label>
          <div className="text-xs text-muted-foreground">
            Separate multiple addresses with commas, semicolons, or spaces.
          </div>
        </div>
        <Input
          id="additionalCc"
          name="additionalCc"
          type="text"
          placeholder="name@example.com, other@example.com"
          className="bg-white"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="replyBody" className="text-sm font-medium text-zinc-950">
          Message
        </label>
        <Textarea
          id="replyBody"
          name="body"
          required
          rows={6}
          placeholder="Write a customer-facing reply."
          onPaste={handlePaste}
        />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="replyAttachments"
              className="text-sm font-medium text-zinc-950"
            >
              Attachments
            </label>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clipboard />
              Paste screenshots into the message, or attach up to{" "}
              {maxAttachmentCount} files and {formatAttachmentLimit()} total.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip data-icon="inline-start" />
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
        {attachments.length > 0 ? (
          <div className="flex flex-col gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={fileKey(attachment)}
                className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
              >
                <Paperclip className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => removeAttachment(index)}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-cyan-700 text-white hover:bg-cyan-800"
        >
          Send reply
        </Button>
      </div>
    </form>
  );
}
