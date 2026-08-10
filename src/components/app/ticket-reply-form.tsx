"use client";

import {
  Clipboard,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Paperclip,
  Underline,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addPublicReply } from "@/app/(app)/tickets/actions";
import {
  formatAttachmentLimit,
  maxAttachmentCount,
} from "@/lib/attachment-limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const textColorOptions = [
  { label: "Default text", value: "#18181b" },
  { label: "Red", value: "#b91c1c" },
  { label: "Amber", value: "#b45309" },
  { label: "Green", value: "#047857" },
  { label: "Blue", value: "#0369a1" },
  { label: "Purple", value: "#7e22ce" },
];
const allowedTextColors = new Set(textColorOptions.map((color) => color.value));

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeTextColor(value: string) {
  const color = value.trim().toLowerCase();

  if (allowedTextColors.has(color)) {
    return color;
  }

  const rgbMatch = color.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
  );

  if (!rgbMatch) {
    return null;
  }

  const [red, green, blue] = rgbMatch.slice(1).map(Number);

  if ([red, green, blue].some((channel) => channel < 0 || channel > 255)) {
    return null;
  }

  const hex = rgbToHex(red, green, blue);
  return allowedTextColors.has(hex) ? hex : null;
}

function isSafeEditorHref(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function sanitizePastedHtmlNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  const childrenHtml = Array.from(element.childNodes)
    .map(sanitizePastedHtmlNode)
    .join("");

  if (tagName === "br") {
    return "<br>";
  }

  if (tagName === "b" || tagName === "strong") {
    return `<strong>${childrenHtml}</strong>`;
  }

  if (tagName === "i" || tagName === "em") {
    return `<em>${childrenHtml}</em>`;
  }

  if (tagName === "u") {
    return `<u>${childrenHtml}</u>`;
  }

  if (tagName === "ul" || tagName === "ol" || tagName === "li") {
    return `<${tagName}>${childrenHtml}</${tagName}>`;
  }

  if (tagName === "p" || tagName === "div") {
    return `<p>${childrenHtml}</p>`;
  }

  if (tagName === "a") {
    const href = element.getAttribute("href") ?? "";
    return isSafeEditorHref(href)
      ? `<a href="${escapeHtml(href)}">${childrenHtml}</a>`
      : childrenHtml;
  }

  if (tagName === "span" || tagName === "font") {
    const color =
      normalizeTextColor(element.style.color) ??
      normalizeTextColor(element.getAttribute("color") ?? "");

    return color
      ? `<span style="color: ${color}">${childrenHtml}</span>`
      : childrenHtml;
  }

  return childrenHtml;
}

function sanitizePastedHtml(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.body.childNodes)
    .map(sanitizePastedHtmlNode)
    .join("");
}

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
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [body, setBody] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
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

  function syncEditorState() {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    setBody(editor.innerText.replace(/\u00a0/g, " ").trim());
    setBodyHtml(editor.innerHTML);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const imageFiles = Array.from(event.clipboardData.files)
      .filter((file) => file.type.startsWith("image/"))
      .map(normalizedImageFile);

    if (imageFiles.length > 0) {
      addAttachments(imageFiles);
      toast({
        variant: "success",
        title: imageFiles.length === 1 ? "Image attached" : "Images attached",
        description: "The pasted image will be sent with your reply.",
      });
      return;
    }

    const pastedHtml = event.clipboardData.getData("text/html");
    const pastedText = event.clipboardData.getData("text/plain");

    if (!pastedHtml && !pastedText) {
      return;
    }

    event.preventDefault();
    const sanitizedHtml = pastedHtml ? sanitizePastedHtml(pastedHtml) : "";

    if (sanitizedHtml) {
      document.execCommand("insertHTML", false, sanitizedHtml);
    } else {
      document.execCommand("insertText", false, pastedText);
    }

    syncEditorState();
  }

  function runEditorCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncEditorState();
  }

  function setTextColor(color: string) {
    runEditorCommand("foreColor", color);
  }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");

    if (!url) {
      return;
    }

    runEditorCommand("createLink", url);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    syncEditorState();

    if (!editorRef.current?.innerText.trim()) {
      toast({
        variant: "destructive",
        title: "Reply body required",
        description: "Write a message before sending the reply.",
      });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("attachments");
    formData.set("body", editorRef.current.innerText.trim());
    formData.set("bodyHtml", editorRef.current.innerHTML);

    for (const attachment of attachments) {
      formData.append("attachments", attachment);
    }

    startTransition(async () => {
      try {
        await addPublicReply(formData);
        setAttachments([]);
        setBody("");
        setBodyHtml("");
        if (editorRef.current) {
          editorRef.current.innerHTML = "";
        }
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
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <label
                htmlFor="additionalCc"
                className="text-sm font-medium text-zinc-950"
              >
                Add Cc
              </label>
              <div className="text-xs text-muted-foreground">
                Commas, semicolons, or spaces.
              </div>
            </div>
            <Input
              id="additionalCc"
              name="additionalCc"
              type="text"
              placeholder="cc@example.com"
              className="bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <label
                htmlFor="additionalBcc"
                className="text-sm font-medium text-zinc-950"
              >
                Add Bcc
              </label>
              <div className="text-xs text-muted-foreground">
                Hidden from other recipients.
              </div>
            </div>
            <Input
              id="additionalBcc"
              name="additionalBcc"
              type="text"
              placeholder="bcc@example.com"
              className="bg-white"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="replyBody" className="text-sm font-medium text-zinc-950">
          Message
        </label>
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="bodyHtml" value={bodyHtml} />
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Bold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("bold")}
          >
            <span className="font-bold leading-none">B</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Italic"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("italic")}
          >
            <Italic />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Underline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("underline")}
          >
            <Underline />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Bulleted list"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("insertUnorderedList")}
          >
            <List />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Numbered list"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runEditorCommand("insertOrderedList")}
          >
            <ListOrdered />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Link"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertLink}
          >
            <LinkIcon />
          </Button>
          <span className="mx-1 h-5 w-px bg-zinc-200" />
          <span className="flex items-center gap-1">
            {textColorOptions.map((color) => (
              <button
                key={color.value}
                type="button"
                aria-label={color.label}
                title={color.label}
                className="flex size-6 items-center justify-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setTextColor(color.value)}
              >
                <span
                  className="size-3 rounded-full border border-zinc-200"
                  style={{ backgroundColor: color.value }}
                />
              </button>
            ))}
          </span>
        </div>
        <div
          ref={editorRef}
          id="replyBody"
          role="textbox"
          aria-label="Message"
          aria-multiline="true"
          contentEditable
          data-placeholder="Write a customer-facing reply."
          className="min-h-32 rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-cyan-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
          onBlur={syncEditorState}
          onInput={syncEditorState}
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
