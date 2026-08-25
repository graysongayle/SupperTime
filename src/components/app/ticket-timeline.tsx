"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Languages,
  MessageSquareText,
  Paperclip,
  Reply,
} from "lucide-react";

import { InternalNoteForm } from "@/components/app/internal-note-form";
import { TicketForwardSheet } from "@/components/app/ticket-forward-sheet";
import { TicketReplyForm } from "@/components/app/ticket-reply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  cannedResponses: CannedResponse[];
  currentUserId: string | null;
  description: string | null;
  mentionUsers: MentionUser[];
  messages: TimelineMessage[];
  participants: TimelineParticipant[];
  supportEmail: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
};

type CannedResponse = {
  id: string;
  title: string;
  body: string;
  bodyHtml: string | null;
};

type TimelineParticipant = {
  id: string;
  email: string;
  name: string | null;
  role: TicketParticipantRole;
};

type MentionUser = {
  email: string;
  id: string;
  name: string | null;
};

type TimelineDetailMode = "expanded" | "collapsed";

type ReplyRecipients = {
  ccEmails: string[];
  label: string;
  toEmails: string[];
};

const timelineDetailModeStorageKey = "suppertime.ticketTimeline.detailMode";
const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const translateTextLimit = 4500;

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

function normalizeActivityBody(body: string | null | undefined) {
  return normalizeMessageBody(body)
    .replace(/(?:&#x20;|&#32;|&nbsp;)+$/gi, "")
    .trim();
}

type CompactTimelineActivity = {
  actor: string | null;
  changeFrom?: string;
  changeTo?: string;
  detail: string;
  label: string;
};

function getCompactTimelineActivity(
  message: TimelineMessage,
): CompactTimelineActivity | null {
  if (
    message.visibility !== MessageVisibility.INTERNAL ||
    message.attachments.length > 0
  ) {
    return null;
  }

  const body = normalizeActivityBody(message.body);
  const isSystemMessage = message.authorType === MessageAuthorType.SYSTEM;

  if (
    isSystemMessage &&
    body ===
    "Customer confirmation auto-reply skipped because SUPPORT_AUTO_REPLY_ENABLED=false."
  ) {
    return {
      actor: null,
      detail: "Customer confirmation auto-reply skipped",
      label: "Auto-reply",
    };
  }

  const statusMatch = body.match(
    /^(.+?) changed status from (.+?) to (.+?)\.$/,
  );

  if (isSystemMessage && statusMatch) {
    return {
      actor: formatCompactActor(statusMatch[1]),
      changeFrom: statusMatch[2],
      changeTo: statusMatch[3],
      detail: "",
      label: "Status",
    };
  }

  const assigneeMatch = body.match(
    /^(.+?) changed assignee from (.+?) to (.+?)\.$/,
  );

  if (isSystemMessage && assigneeMatch) {
    return {
      actor: formatCompactActor(assigneeMatch[1]),
      changeFrom: formatCompactActor(assigneeMatch[2]),
      changeTo: formatCompactActor(assigneeMatch[3]),
      detail: "",
      label: "Assignee",
    };
  }

  const priorityMatch = body.match(
    /^(.+?) changed priority from (.+?) to (.+?)\.$/,
  );

  if (isSystemMessage && priorityMatch) {
    return {
      actor: formatCompactActor(priorityMatch[1]),
      changeFrom: priorityMatch[2],
      changeTo: priorityMatch[3],
      detail: "",
      label: "Priority",
    };
  }

  const autoReopenMatch = body.match(
    /^Ticket reopened automatically because (.+?) replied to a resolved ticket\.$/,
  );

  if (isSystemMessage && autoReopenMatch) {
    return {
      actor: null,
      changeFrom: formatCompactActor(autoReopenMatch[1]),
      detail: "",
      label: "Reopened",
    };
  }

  const automatedInboundMatch = body.match(
    /^Inbound email appears automated \((.+?)\)\. Customer confirmation auto-reply was suppressed to prevent response loops\.$/,
  );

  if (isSystemMessage && automatedInboundMatch) {
    return {
      actor: null,
      changeFrom: automatedInboundMatch[1],
      detail: "",
      label: "Automated inbound",
    };
  }

  const forwardedMatch = body.match(
    /^Forwarded ticket to (.+?)\.\n\nMode: (.+?)\.$/,
  );

  if (forwardedMatch) {
    return {
      actor: formatCompactActor(getMessageAuthor(message)),
      changeFrom: forwardedMatch[1],
      changeTo: forwardedMatch[2],
      detail: "",
      label: "Forwarded",
    };
  }

  return null;
}

function formatCompactActor(value: string) {
  return value.replace(/\s+<[^>]+>$/, "").trim();
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

function isInlineImageAttachment(attachment: TimelineAttachment) {
  return attachment.contentType.toLowerCase().startsWith("image/");
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

function extractEmailAddresses(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return Array.from(value.matchAll(emailPattern), (match) =>
    match[0].toLowerCase(),
  );
}

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => value.toLowerCase())));
}

function isSupportAddress(email: string, supportEmail: string) {
  const [supportLocalPart, supportDomain] = supportEmail.toLowerCase().split("@");
  const [localPart, domain] = email.toLowerCase().split("@");

  return (
    email.toLowerCase() === supportEmail.toLowerCase() ||
    Boolean(
      supportLocalPart &&
        supportDomain &&
        domain === supportDomain &&
        localPart.startsWith(`${supportLocalPart}+`),
    )
  );
}

function isReplyableMessage(message: TimelineMessage) {
  return (
    message.visibility === MessageVisibility.PUBLIC &&
    (message.authorType === MessageAuthorType.CUSTOMER ||
      message.authorType === MessageAuthorType.AGENT)
  );
}

function getTranslationUrl(message: TimelineMessage) {
  if (
    message.visibility !== MessageVisibility.PUBLIC ||
    (message.authorType !== MessageAuthorType.CUSTOMER &&
      message.authorType !== MessageAuthorType.AGENT)
  ) {
    return null;
  }

  const body = normalizeMessageBody(message.body);

  if (!body) {
    return null;
  }

  const params = new URLSearchParams({
    op: "translate",
    sl: "auto",
    text: body.slice(0, translateTextLimit),
    tl: "en",
  });

  return `https://translate.google.com/?${params.toString()}`;
}

function TranslateMessageButton({ message }: { message: TimelineMessage }) {
  const translateUrl = getTranslationUrl(message);

  if (!translateUrl) {
    return null;
  }

  return (
    <Button type="button" variant="outline" size="sm" className="bg-white" asChild>
      <a href={translateUrl} target="_blank" rel="noopener noreferrer">
        <Languages data-icon="inline-start" />
        Translate
      </a>
    </Button>
  );
}

function getReplyRecipients({
  message,
  supportEmail,
}: {
  message: TimelineMessage;
  supportEmail: string;
}): ReplyRecipients {
  const emailFrom = extractEmailAddresses(message.emailFrom);
  const emailTo = extractEmailAddresses(message.emailTo);
  const emailCc = extractEmailAddresses(message.emailCc);
  const fallbackAuthorEmail =
    message.authorType === MessageAuthorType.CUSTOMER
      ? message.customer?.email
      : null;
  const toEmails =
    message.authorType === MessageAuthorType.CUSTOMER
      ? uniqueEmails([
          ...emailFrom,
          ...(fallbackAuthorEmail ? [fallbackAuthorEmail] : []),
        ]).filter((email) => !isSupportAddress(email, supportEmail))
      : uniqueEmails(emailTo).filter(
          (email) => !isSupportAddress(email, supportEmail),
        );
  const toEmailSet = new Set(toEmails);
  const ccEmails =
    message.authorType === MessageAuthorType.CUSTOMER
      ? uniqueEmails([...emailCc, ...emailTo]).filter(
          (email) =>
            !isSupportAddress(email, supportEmail) && !toEmailSet.has(email),
        )
      : uniqueEmails(emailCc).filter(
          (email) =>
            !isSupportAddress(email, supportEmail) && !toEmailSet.has(email),
        );
  const label =
    toEmails.length > 0
      ? toEmails.join(", ")
      : message.customer?.email ?? getMessageAuthor(message);

  return {
    ccEmails,
    label,
    toEmails,
  };
}

function ReplyDialog({
  cannedResponses,
  message,
  supportEmail,
  ticketId,
}: {
  cannedResponses: CannedResponse[];
  message: TimelineMessage;
  supportEmail: string;
  ticketId: string;
}) {
  const [open, setOpen] = useState(false);
  const recipients = getReplyRecipients({ message, supportEmail });

  if (!isReplyableMessage(message) || recipients.toEmails.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="bg-white">
          <Reply data-icon="inline-start" />
          Reply
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reply to this response</DialogTitle>
        </DialogHeader>
        <TicketReplyForm
          cannedResponses={cannedResponses}
          ccParticipants={[]}
          defaultCcEmails={recipients.ccEmails}
          defaultToEmails={recipients.toEmails}
          onSent={() => setOpen(false)}
          replyRecipientLabel={recipients.label}
          ticketId={ticketId}
          toParticipants={[]}
        />
      </DialogContent>
    </Dialog>
  );
}

function MessageRecipients({
  message,
  participants,
}: {
  message: TimelineMessage;
  participants: TimelineParticipant[];
}) {
  if (message.visibility === MessageVisibility.INTERNAL) {
    return null;
  }

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

  const imageAttachments = attachments.filter(isInlineImageAttachment);
  const fileAttachments = attachments.filter(
    (attachment) => !isInlineImageAttachment(attachment),
  );

  return (
    <div className="mt-3 flex flex-col gap-3">
      {imageAttachments.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {imageAttachments.map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/attachments/${attachment.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white"
            >
              <Image
                src={`/api/attachments/${attachment.id}/view`}
                alt={attachment.fileName}
                className="max-h-80 w-full object-contain"
                width={960}
                height={640}
                loading="lazy"
                unoptimized
              />
              <span className="flex min-w-0 items-center gap-2 border-t border-zinc-200 px-3 py-2 text-xs text-muted-foreground">
                <Paperclip className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {attachment.fileName}
                </span>
                <span className="shrink-0">{formatBytes(attachment.sizeBytes)}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {fileAttachments.map((attachment) => (
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
  return normalizeEmailHtmlSpacingEntities(
    sanitizeEmailHtmlDocument(html)?.body.innerHTML ?? "",
  );
}

function sanitizeEmailHtmlDocument(html: string) {
  if (typeof window === "undefined") {
    return null;
  }

  let document: Document;

  try {
    const parser = new DOMParser();
    document = parser.parseFromString(html, "text/html");
  } catch {
    return null;
  }

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

  return document;
}

function textContentOf(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isNoisyEmailElement(element: Element) {
  const className =
    typeof element.className === "string" ? element.className : "";
  const classAndId = `${element.id} ${className}`.toLowerCase();

  return [
    "gmail_quote",
    "gmail_signature",
    "yahoo_quoted",
    "moz-cite-prefix",
    "mso",
    "signature",
    "quoted",
    "unsubscribe",
  ].some((token) => classAndId.includes(token));
}

function simplifyEmailHtml(html: string) {
  const document = sanitizeEmailHtmlDocument(html);

  if (!document) {
    return "";
  }

  document
    .querySelectorAll(
      [
        ".gmail_quote",
        ".gmail_signature",
        ".yahoo_quoted",
        ".moz-cite-prefix",
        "blockquote[type='cite']",
      ].join(","),
    )
    .forEach((node) => node.remove());

  document.body.querySelectorAll("*").forEach((element) => {
    if (isNoisyEmailElement(element)) {
      element.remove();
      return;
    }

    if (!textContentOf(element) && element.children.length === 0) {
      element.remove();
    }
  });

  document.body.querySelectorAll("div").forEach((element) => {
    if (element.children.length > 0) {
      return;
    }

    const text = textContentOf(element);

    if (!text) {
      element.remove();
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    element.replaceWith(paragraph);
  });

  document.body.querySelectorAll("span").forEach((element) => {
    if (element.children.length > 0) {
      return;
    }

    element.replaceWith(document.createTextNode(element.textContent ?? ""));
  });

  document.body.querySelectorAll("p").forEach((element) => {
    const text = textContentOf(element);

    if (!text) {
      element.remove();
    }
  });

  const paragraphs = Array.from(document.body.querySelectorAll("p"));

  for (let index = paragraphs.length - 1; index > 0; index -= 1) {
    const current = paragraphs[index];
    const previous = paragraphs[index - 1];

    if (textContentOf(current) === textContentOf(previous)) {
      current.remove();
    }
  }

  return normalizeEmailHtmlSpacingEntities(document.body.innerHTML);
}

function normalizeEmailHtmlSpacingEntities(html: string) {
  return html.replace(/&amp;(nbsp|#160|#xa0);/gi, "&$1;");
}

function MessageBody({
  message,
  viewMode,
}: {
  message: TimelineMessage;
  viewMode: "formatted" | "plain";
}) {
  const sanitizedHtml = useSanitizedEmailHtml(message.bodyHtml);
  const plainBody = normalizeMessageBody(message.body);
  const showFormatted = viewMode === "formatted" && sanitizedHtml;
  const iframeDocument = useMemo(
    () => (sanitizedHtml ? buildTimelineEmailIframeDocument(sanitizedHtml) : ""),
    [sanitizedHtml],
  );

  return (
    <div className="mt-3 min-w-0">
      {showFormatted ? (
        <iframe
          title={`${getMessageLabel(message)} message preview`}
          srcDoc={iframeDocument}
          sandbox="allow-popups"
          className="h-80 w-full rounded-lg border border-zinc-200 bg-white"
        />
      ) : (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-zinc-700 [overflow-wrap:anywhere]",
            message.visibility === MessageVisibility.INTERNAL
              ? "text-xs"
              : "text-sm",
          )}
        >
          {plainBody || "No message body."}
        </p>
      )}
    </div>
  );
}

function MessageViewToggle({
  message,
  onChange,
  value,
}: {
  message: TimelineMessage;
  onChange: (value: "formatted" | "plain") => void;
  value: "formatted" | "plain";
}) {
  const sanitizedHtml = useSanitizedEmailHtml(message.bodyHtml, {
    simplify: true,
  });
  const plainBody = normalizeMessageBody(message.body);

  if (!sanitizedHtml || !plainBody) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white p-0.5">
      <Button
        type="button"
        variant={value === "formatted" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => onChange("formatted")}
      >
        Formatted
      </Button>
      <Button
        type="button"
        variant={value === "plain" ? "default" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => onChange("plain")}
      >
        Plain text
      </Button>
    </span>
  );
}

function CompactTimelineActivityRow({
  activity,
  createdAt,
}: {
  activity: CompactTimelineActivity;
  createdAt: string;
}) {
  const isAssignmentChange =
    activity.label === "Assignee" && activity.changeFrom && activity.changeTo;
  const isStatusChange =
    activity.label === "Status" && activity.changeFrom && activity.changeTo;
  const isPriorityChange =
    activity.label === "Priority" && activity.changeFrom && activity.changeTo;
  const isAutomaticReopen =
    activity.label === "Reopened" && activity.changeFrom;
  const isAutomatedInbound =
    activity.label === "Automated inbound" && activity.changeFrom;
  const isForwarded =
    activity.label === "Forwarded" && activity.changeFrom && activity.changeTo;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-zinc-50 px-2 py-1.5 text-xs text-muted-foreground ring-1 ring-zinc-100">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {isAutomaticReopen ? (
          <span className="min-w-0 truncate text-zinc-700">
            Ticket reopened automatically because{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeFrom}
            </strong>{" "}
            replied to a resolved ticket
          </span>
        ) : isAutomatedInbound ? (
          <span className="min-w-0 truncate text-zinc-700">
            Automated inbound detected:{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeFrom}
            </strong>
            . Auto-reply suppressed.
          </span>
        ) : isForwarded ? (
          <span className="min-w-0 truncate text-zinc-700">
            {activity.actor ?? "System"} forwarded ticket to{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeFrom}
            </strong>{" "}
            ({activity.changeTo})
          </span>
        ) : isAssignmentChange || isStatusChange || isPriorityChange ? (
          <span className="min-w-0 truncate text-zinc-700">
            {activity.actor ?? "System"} changed{" "}
            {isAssignmentChange
              ? "assignment"
              : isPriorityChange
                ? "priority"
                : "status"}{" "}
            from{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeFrom}
            </strong>{" "}
            {"\u2192"}{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeTo}
            </strong>
          </span>
        ) : activity.changeFrom && activity.changeTo ? (
          <span className="min-w-0 truncate text-zinc-700">
            <span className="font-medium text-zinc-600">{activity.label}</span>{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeFrom}
            </strong>{" "}
            {"\u2192"}{" "}
            <strong className="font-semibold text-zinc-800">
              {activity.changeTo}
            </strong>
          </span>
        ) : (
          <span className="min-w-0 truncate text-zinc-700">
            {activity.detail}
          </span>
        )}
        {activity.actor &&
        !isAssignmentChange &&
        !isStatusChange &&
        !isPriorityChange &&
        !isAutomaticReopen &&
        !isAutomatedInbound &&
        !isForwarded ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{activity.actor}</span>
          </>
        ) : null}
      </span>
      <time className="ml-auto shrink-0 truncate text-right">
        {formatDate(createdAt)}
      </time>
    </div>
  );
}

function useSanitizedEmailHtml(
  html: string | null,
  options: { simplify?: boolean } = {},
) {
  const [sanitizedHtml, setSanitizedHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!html) {
      setSanitizedHtml(null);
      return;
    }

    const nextHtml = options.simplify
      ? simplifyEmailHtml(html)
      : sanitizeEmailHtml(html);
    setSanitizedHtml(nextHtml || null);
  }, [html, options.simplify]);

  return sanitizedHtml;
}

function buildTimelineEmailIframeDocument(html: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base target="_blank">
    <style>
      :root { color-scheme: light; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #18181b;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }
      body {
        overflow-wrap: anywhere;
      }
      .email-content {
        box-sizing: border-box;
        width: 100%;
        min-height: 100%;
        padding: 14px;
        overflow-x: auto;
      }
      * {
        box-sizing: border-box;
        max-width: 100%;
      }
      a {
        color: #0e7490;
        text-decoration: underline;
        overflow-wrap: anywhere;
      }
      blockquote {
        margin: 12px 0;
        border-left: 2px solid #d4d4d8;
        padding-left: 12px;
        color: #52525b;
      }
      img, iframe, object, embed, video, audio, svg, canvas {
        display: none !important;
      }
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      td, th {
        overflow-wrap: anywhere;
        vertical-align: top;
      }
      pre {
        max-width: 100%;
        overflow-x: auto;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div class="email-content">${html}</div>
  </body>
</html>`;
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

export function TicketTimeline({
  cannedResponses,
  currentUserId,
  description,
  mentionUsers,
  messages,
  participants,
  supportEmail,
  ticketId,
  ticketNumber,
  ticketSubject,
}: TicketTimelineProps) {
  const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
  const [detailMode, setDetailMode] =
    useState<TimelineDetailMode>("expanded");
  const [hasLoadedDetailMode, setHasLoadedDetailMode] = useState(false);
  const [messageViewModes, setMessageViewModes] = useState<
    Record<string, "formatted" | "plain">
  >({});
  const descriptionId = "__ticket_description__";
  const displayDescription =
    normalizeMessageBody(description) &&
    !messages.some(
      (message) =>
        normalizeMessageBody(message.body) === normalizeMessageBody(description),
    )
      ? description
      : null;
  const timelineItemIds = useMemo(
    () => [
      ...(displayDescription ? [descriptionId] : []),
      ...messages
        .filter((message) => !getCompactTimelineActivity(message))
        .map((message) => message.id),
    ],
    [displayDescription, messages],
  );
  const allCollapsed =
    timelineItemIds.length > 0 && collapsedIds.length === timelineItemIds.length;
  const hasCollapsed = collapsedIds.length > 0;

  useEffect(() => {
    const storedDetailMode = window.localStorage.getItem(
      timelineDetailModeStorageKey,
    );

    if (storedDetailMode === "collapsed" || storedDetailMode === "expanded") {
      setDetailMode(storedDetailMode);
    }

    setHasLoadedDetailMode(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedDetailMode) {
      return;
    }

    setCollapsedIds(detailMode === "collapsed" ? timelineItemIds : []);
  }, [detailMode, hasLoadedDetailMode, timelineItemIds]);

  function toggleTimelineItem(itemId: string) {
    setCollapsedIds((current) => {
      if (current.includes(itemId)) {
        return current.filter((id) => id !== itemId);
      }

      return [...current, itemId];
    });
  }

  function toggleAll() {
    const nextDetailMode = allCollapsed ? "expanded" : "collapsed";

    setDetailMode(nextDetailMode);
    window.localStorage.setItem(timelineDetailModeStorageKey, nextDetailMode);
  }

  function setMessageViewMode(
    messageId: string,
    viewMode: "formatted" | "plain",
  ) {
    setMessageViewModes((current) => ({
      ...current,
      [messageId]: viewMode,
    }));
  }

  const descriptionCollapsed = collapsedIds.includes(descriptionId);

  return (
    <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-cyan-700" />
            Timeline
          </span>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <InternalNoteForm
              cannedResponses={cannedResponses}
              currentUserId={currentUserId}
              mentionUsers={mentionUsers}
              ticketId={ticketId}
            />
            <TicketForwardSheet
              cannedResponses={cannedResponses}
              ticketId={ticketId}
              ticketNumber={ticketNumber}
              ticketSubject={ticketSubject}
            />
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
          </span>
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
          const compactActivity = getCompactTimelineActivity(message);
          const isCollapsed = collapsedIds.includes(message.id);
          const messageViewMode = messageViewModes[message.id] ?? "formatted";

          if (compactActivity) {
            return (
              <CompactTimelineActivityRow
                key={message.id}
                activity={compactActivity}
                createdAt={message.createdAt}
              />
            );
          }

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
                  <TranslateMessageButton message={message} />
                  <ReplyDialog
                    cannedResponses={cannedResponses}
                    message={message}
                    supportEmail={supportEmail}
                    ticketId={ticketId}
                  />
                  {!isCollapsed ? (
                    <MessageViewToggle
                      message={message}
                      value={messageViewMode}
                      onChange={(value) =>
                        setMessageViewMode(message.id, value)
                      }
                    />
                  ) : null}
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(message.createdAt)}
                  </span>
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
                  <MessageBody
                    message={message}
                    viewMode={messageViewMode}
                  />
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
