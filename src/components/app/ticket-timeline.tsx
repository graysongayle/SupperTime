"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MessageAuthorType,
  MessageVisibility,
  TicketParticipantRole,
} from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type TimelineMessage = {
  id: string;
  attachments: TimelineAttachment[];
  authorType: MessageAuthorType;
  visibility: MessageVisibility;
  body: string;
  bodyHtml: string | null;
  emailCc: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  createdAt: string;
  agent: { name: string | null; email: string } | null;
  customer: { name: string | null; email: string } | null;
};

type TimelineAttachment = {
  id: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

type TicketTimelineProps = {
  description: string | null;
  messages: TimelineMessage[];
  participants: TimelineParticipant[];
};

type TimelineParticipant = {
  id: string;
  email: string;
  name: string | null;
  role: TicketParticipantRole;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getMessageAuthor(message: TimelineMessage) {
  if (message.authorType === MessageAuthorType.AGENT) {
    return message.agent?.name ?? message.agent?.email ?? "Agent";
  }

  if (message.authorType === MessageAuthorType.CUSTOMER) {
    return message.customer?.name ?? message.customer?.email ?? "Customer";
  }

  return "System";
}

function getMessageLabel(message: TimelineMessage) {
  if (message.visibility === MessageVisibility.INTERNAL) {
    return "Internal note";
  }

  if (message.authorType === MessageAuthorType.CUSTOMER) {
    return "Customer";
  }

  if (message.authorType === MessageAuthorType.AGENT) {
    return "Agent";
  }

  return "System";
}

function getCollapsedPreview(body: string) {
  const firstLine = body.split(/\r?\n/).find(Boolean)?.trim();

  if (!firstLine) {
    return "No message body.";
  }

  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
}

function normalizeMessageBody(body: string | null | undefined) {
  return (body ?? "").replace(/\r\n/g, "\n").trim();
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMessageAccentClass(message: TimelineMessage) {
  if (message.visibility === MessageVisibility.INTERNAL) {
    return "bg-amber-500";
  }

  if (message.authorType === MessageAuthorType.CUSTOMER) {
    return "bg-cyan-600";
  }

  if (message.authorType === MessageAuthorType.AGENT) {
    return "bg-zinc-700";
  }

  return "bg-zinc-400";
}

function getMessageContainerClass(message: TimelineMessage) {
  if (message.visibility === MessageVisibility.INTERNAL) {
    return "border-amber-200 bg-amber-50/80 shadow-amber-950/5";
  }

  if (message.authorType === MessageAuthorType.CUSTOMER) {
    return "border-cyan-200 bg-white shadow-cyan-950/5";
  }

  return "border-zinc-200 bg-white shadow-zinc-950/5";
}

function getParticipantRoleLabel(role: TicketParticipantRole) {
  if (role === TicketParticipantRole.REQUESTER) {
    return "Requester";
  }

  if (role === TicketParticipantRole.CC) {
    return "CC";
  }

  if (role === TicketParticipantRole.TO) {
    return "To";
  }

  return "Other";
}

function formatParticipant(participant: TimelineParticipant) {
  const identity = participant.name
    ? `${participant.name} <${participant.email}>`
    : participant.email;

  return `${getParticipantRoleLabel(participant.role)}: ${identity}`;
}

function MessageRecipients({
  message,
  participants,
}: {
  message: TimelineMessage;
  participants: TimelineParticipant[];
}) {
  const from = message.emailFrom ?? getMessageAuthor(message);
  const hasMessageRecipients = Boolean(message.emailTo || message.emailCc);
  const showTicketParticipants = !hasMessageRecipients && participants.length > 0;

  if (!from && !message.emailTo && !message.emailCc && !showTicketParticipants) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-muted-foreground">
      {from ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[42px_minmax(0,1fr)]">
          <span className="font-medium text-zinc-600">From</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {from}
          </span>
        </div>
      ) : null}
      {message.emailTo ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[42px_minmax(0,1fr)]">
          <span className="font-medium text-zinc-600">To</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {message.emailTo}
          </span>
        </div>
      ) : null}
      {message.emailCc ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[42px_minmax(0,1fr)]">
          <span className="font-medium text-zinc-600">CC</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {message.emailCc}
          </span>
        </div>
      ) : null}
      {showTicketParticipants ? (
        <div className="grid min-w-0 gap-1 sm:grid-cols-[82px_minmax(0,1fr)]">
          <span className="font-medium text-zinc-600">Participants</span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {participants.map(formatParticipant).join("; ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MessageAttachments({
  attachments,
}: {
  attachments: TimelineAttachment[];
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {attachments.map((attachment) => (
        <Button
          key={attachment.id}
          variant="outline"
          size="sm"
          className="h-auto justify-start bg-white px-3 py-2"
          asChild
        >
          <a
            href={`/api/attachments/${attachment.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Paperclip className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate">{attachment.fileName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {attachment.contentType} · {formatBytes(attachment.sizeBytes)}
              </span>
            </span>
            <Download className="size-4 shrink-0" />
          </a>
        </Button>
      ))}
    </div>
  );
}

function sanitizeEmailHtml(html: string) {
  if (typeof window === "undefined") {
    return "";
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const blockedSelectors = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "meta",
    "link",
    "base",
    "svg",
    "canvas",
    "video",
    "audio",
    "img",
  ];

  document.querySelectorAll(blockedSelectors.join(",")).forEach((node) => {
    node.remove();
  });

  document.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (
        name.startsWith("on") ||
        name === "srcset" ||
        name === "contenteditable"
      ) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if ((name === "href" || name === "src") && !isSafeUrl(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "style" && /url\s*\(|expression\s*\(/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element.tagName.toLowerCase() === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });

  return document.body.innerHTML;
}

function isSafeUrl(value: string) {
  if (!value || value.startsWith("#") || value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function FormattedEmailSheet({
  html,
  subject,
  trigger,
}: {
  html: string;
  subject: string;
  trigger: React.ReactNode;
}) {
  const sanitizedHtml = useMemo(() => sanitizeEmailHtml(html), [html]);

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b border-zinc-200">
          <SheetTitle>Formatted email</SheetTitle>
          <SheetDescription>{subject}</SheetDescription>
        </SheetHeader>
        <div
          className="mx-4 mb-4 max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-800 [overflow-wrap:anywhere] [&_*]:max-w-full [&_a]:break-words [&_a]:text-cyan-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-300 [&_blockquote]:pl-3 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_td]:break-words [&_td]:border [&_td]:border-zinc-200 [&_td]:p-2 [&_th]:break-words [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:p-2"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </SheetContent>
    </Sheet>
  );
}

function MessageActions({ message }: { message: TimelineMessage }) {
  const hasActions = Boolean(message.bodyHtml);

  if (!hasActions) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Message actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {message.bodyHtml ? (
          <FormattedEmailSheet
            html={message.bodyHtml}
            subject={`${getMessageLabel(message)} from ${getMessageAuthor(
              message,
            )}`}
            trigger={
              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                <Eye className="size-4" />
                View formatted
              </DropdownMenuItem>
            }
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TicketTimeline({
  description,
  messages,
  participants,
}: TicketTimelineProps) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const descriptionId = "__ticket_description__";
  const displayDescription =
    normalizeMessageBody(description) &&
    normalizeMessageBody(description) !== normalizeMessageBody(messages[0]?.body)
      ? description
      : null;
  const timelineItemIds = useMemo(
    () => [
      ...(displayDescription ? [descriptionId] : []),
      ...messages.map((message) => message.id),
    ],
    [displayDescription, messages],
  );
  const allCollapsed =
    timelineItemIds.length > 0 && collapsedIds.length === timelineItemIds.length;
  const hasCollapsed = collapsedIds.length > 0;

  function toggleTimelineItem(itemId: string) {
    setCollapsedIds((current) => {
      if (current.includes(itemId)) {
        return current.filter((id) => id !== itemId);
      }

      return [...current, itemId];
    });
  }

  function toggleAll() {
    setCollapsedIds(allCollapsed ? [] : timelineItemIds);
  }

  const descriptionCollapsed = collapsedIds.includes(descriptionId);

  return (
    <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-cyan-700" />
            Timeline
          </span>
          {timelineItemIds.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={toggleAll}
            >
              {allCollapsed || hasCollapsed ? "Expand all" : "Collapse all"}
            </Button>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        {displayDescription ? (
          <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-sm shadow-sm">
            <div className="h-1 w-full bg-zinc-400" />
            <button
              type="button"
              onClick={() => toggleTimelineItem(descriptionId)}
              className="flex w-full min-w-0 items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-left"
              aria-expanded={!descriptionCollapsed}
            >
              {descriptionCollapsed ? (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                #0
              </span>
              <Badge variant="outline" className="shrink-0">
                Description
              </Badge>
              <span className="truncate text-sm font-medium text-zinc-950">
                Ticket description
              </span>
            </button>
            {descriptionCollapsed ? (
              <p className="truncate px-3 py-3 pl-10 text-sm text-muted-foreground">
                {getCollapsedPreview(displayDescription)}
              </p>
            ) : (
              <div className="px-3 pb-3">
                <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">
                  {displayDescription}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isCollapsed = collapsedIds.includes(message.id);

          return (
            <div
              key={message.id}
              className={cn(
                "min-w-0 overflow-hidden rounded-lg border shadow-sm",
                getMessageContainerClass(message),
              )}
            >
              <div
                className={cn(
                  "h-1 w-full",
                  getMessageAccentClass(message),
                )}
              />
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleTimelineItem(message.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    #{index + 1}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {getMessageLabel(message)}
                  </Badge>
                  <span className="truncate text-sm font-medium">
                    {getMessageAuthor(message)}
                  </span>
                </button>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(message.createdAt)}
                  </span>
                  <MessageActions message={message} />
                </span>
              </div>

              {isCollapsed ? (
                <p className="truncate px-3 py-3 pl-10 text-sm text-muted-foreground">
                  {getCollapsedPreview(message.body)}
                </p>
              ) : (
                <div className="min-w-0 px-3 pb-3">
                  <MessageRecipients
                    message={message}
                    participants={participants}
                  />
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-700 [overflow-wrap:anywhere]">
                    {message.body}
                  </p>
                  <MessageAttachments attachments={message.attachments} />
                </div>
              )}
            </div>
          );
        })}

        {messages.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-muted-foreground">
            No messages yet.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
