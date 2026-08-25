"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  MessageAuthorType,
  MessageVisibility,
  TicketParticipantRole,
  TicketPriority,
  TicketSource,
  TicketStatus,
  UserRole,
  type TicketPriority as TicketPriorityValue,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";
import {
  deleteStoredAttachments,
  formDataFilesToPendingAttachments,
  pendingAttachmentsToPostmarkAttachments,
  uploadTicketAttachments,
} from "@/lib/attachments";
import {
  buildTicketUrl,
  buildCustomerConfirmationText,
  buildCustomerConfirmationSubject,
  buildTicketReplyAddress,
  createEmailReplyToken,
  getAutomatedReplyHeaders,
  isSupportAutoReplyEnabled,
  sendSupportEmail,
  textToHtml,
} from "@/lib/support-email";

const validStatuses = new Set<TicketStatusValue>(Object.values(TicketStatus));
const validPriorities = new Set<TicketPriorityValue>(Object.values(TicketPriority));
const ticketPreferencePageKey = "tickets";
const validTicketSorts = new Set([
  "last_customer_desc",
  "last_customer_asc",
  "last_agent_desc",
  "last_agent_asc",
  "updated_desc",
  "updated_asc",
  "received_desc",
  "received_asc",
]);
const validTicketViews = new Set(["mine", "unassigned"]);
const ticketPreferenceViewKeys = ["all", "mine", "unassigned"] as const;
const statusLabels: Record<TicketStatusValue, string> = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};
const priorityLabels: Record<TicketPriorityValue, string> = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};
const forwardLogPrefix = "[ticket-forward]";
const forwardModeLabels = {
  link: "Ticket link only",
  latest_customer: "Latest customer response",
  public_thread: "Full public thread",
} as const;
const validForwardModes = new Set(Object.keys(forwardModeLabels));
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

async function requireTicketUser() {
  const user = await getCurrentAppUser();

  if (!user || !user.isActive || user.role === UserRole.GUEST) {
    throw new Error("You do not have permission to manage tickets.");
  }

  return user;
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function parseCommaSeparated(value: string | null) {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeTicketPreference(formData: FormData) {
  const preferences: Record<string, string> = {};
  const statuses = parseCommaSeparated(optionalString(formData, "status"))
    .map((status) => status.toUpperCase() as TicketStatusValue)
    .filter((status) => validStatuses.has(status));
  const priorities = parseCommaSeparated(optionalString(formData, "priority"))
    .map((priority) => priority.toUpperCase() as TicketPriorityValue)
    .filter((priority) => validPriorities.has(priority));
  const assignees = parseCommaSeparated(optionalString(formData, "assignee"));
  const sort = optionalString(formData, "sort");
  const view = optionalString(formData, "view");

  if (statuses.length > 0) {
    preferences.status = statuses.join(",");
  }

  if (priorities.length > 0) {
    preferences.priority = priorities.join(",");
  }

  if (assignees.length > 0) {
    preferences.assignee = assignees.join(",");
  }

  if (sort && validTicketSorts.has(sort)) {
    preferences.sort = sort;
  }

  if (view && validTicketViews.has(view)) {
    preferences.view = view;
  }

  return preferences;
}

function getTicketPreferenceViewKey(view: string | null) {
  return view && validTicketViews.has(view)
    ? (view as "mine" | "unassigned")
    : "all";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasPreferenceValues(preferences: Record<string, string>) {
  return Object.keys(preferences).length > 0;
}

function normalizeStoredTicketPreference(value: unknown) {
  const source = isRecord(value) ? value : {};
  const sourceViews = isRecord(source.views) ? source.views : null;
  const views: Record<string, Record<string, string>> = {};

  ticketPreferenceViewKeys.forEach((key) => {
    const preference = sourceViews?.[key];

    if (isRecord(preference)) {
      views[key] = Object.fromEntries(
        Object.entries(preference).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    } else {
      views[key] = {};
    }
  });

  if (!sourceViews && isRecord(value)) {
    const legacyPreference = Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const legacyKey = getTicketPreferenceViewKey(legacyPreference.view ?? null);
    views[legacyKey] = legacyPreference;
  }

  return {
    version: 2,
    views,
  };
}

function parseEmailList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function parseEmailFormValues(values: FormDataEntryValue[]) {
  return values.flatMap((value) =>
    typeof value === "string" ? parseEmailList(value) : [],
  );
}

function assertValidEmail(email: string) {
  if (!emailPattern.test(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }
}

function formatActor(actor: { email: string; name: string | null }) {
  return actor.name ? `${actor.name} <${actor.email}>` : actor.email;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlTextEntities(value: string) {
  return value.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|apos|#x[0-9a-f]+|#[0-9]+);/gi,
    (entity) => {
      const normalized = entity.toLowerCase();

      if (normalized === "&nbsp;") {
        return "\u00a0";
      }

      if (normalized === "&amp;") {
        return "&";
      }

      if (normalized === "&lt;") {
        return "<";
      }

      if (normalized === "&gt;") {
        return ">";
      }

      if (normalized === "&quot;") {
        return '"';
      }

      if (normalized === "&#39;" || normalized === "&apos;") {
        return "'";
      }

      const codePoint = normalized.startsWith("&#x")
        ? Number.parseInt(normalized.slice(3, -1), 16)
        : Number.parseInt(normalized.slice(2, -1), 10);

      if (!Number.isFinite(codePoint)) {
        return entity;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    },
  );
}

function escapeSubmittedHtmlText(value: string) {
  return escapeHtml(decodeHtmlTextEntities(value));
}

function renderReplyInlineFormatting(value: string) {
  return escapeHtml(value)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
      '<a href="$2">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function renderReplyBodyHtml(body: string) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let openList: "ol" | "ul" | null = null;

  function closeList() {
    if (openList) {
      html.push(`</${openList}>`);
      openList = null;
    }
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      closeList();
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      const listType = orderedMatch ? "ol" : "ul";
      const itemText = orderedMatch?.[1] ?? unorderedMatch?.[1] ?? "";

      if (openList !== listType) {
        closeList();
        html.push(`<${listType}>`);
        openList = listType;
      }

      html.push(`<li>${renderReplyInlineFormatting(itemText)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderReplyInlineFormatting(trimmedLine)}</p>`);
  }

  closeList();

  return html.join("");
}

function isSafeReplyHref(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

const allowedReplyTextColors = new Set([
  "#18181b",
  "#b91c1c",
  "#b45309",
  "#047857",
  "#0369a1",
  "#7e22ce",
]);

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeReplyTextColor(value: string) {
  const color = value.trim().toLowerCase();

  if (allowedReplyTextColors.has(color)) {
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
  return allowedReplyTextColors.has(hex) ? hex : null;
}

function getSubmittedReplyTextColor(rawTag: string) {
  const colorAttribute = rawTag.match(/\scolor=(["'])(.*?)\1/i)?.[2];

  if (colorAttribute) {
    return normalizeReplyTextColor(colorAttribute);
  }

  const styleColor = rawTag.match(
    /\sstyle=(["'])(?:(?!\1).)*color\s*:\s*([^;"']+)(?:(?!\1).)*\1/i,
  )?.[2];

  return styleColor ? normalizeReplyTextColor(styleColor) : null;
}

function sanitizeSubmittedReplyHtml(html: string) {
  const tagPattern = /<\/?[^>]+>/g;
  const output: string[] = [];
  let lastIndex = 0;
  let openColorSpanCount = 0;

  for (const match of html.matchAll(tagPattern)) {
    const rawTag = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      output.push(escapeSubmittedHtmlText(html.slice(lastIndex, index)));
    }

    const isClosingTag = rawTag.startsWith("</");
    const tagName = rawTag
      .replace(/^<\/?\s*/, "")
      .split(/[\s>/]/)[0]
      ?.toLowerCase();

    if (!tagName) {
      lastIndex = index + rawTag.length;
      continue;
    }

    if (tagName === "br") {
      output.push("<br>");
      lastIndex = index + rawTag.length;
      continue;
    }

    if (tagName === "b" || tagName === "strong") {
      output.push(isClosingTag ? "</strong>" : "<strong>");
    } else if (tagName === "i" || tagName === "em") {
      output.push(isClosingTag ? "</em>" : "<em>");
    } else if (tagName === "u") {
      output.push(isClosingTag ? "</u>" : "<u>");
    } else if (tagName === "ul" || tagName === "ol" || tagName === "li") {
      output.push(isClosingTag ? `</${tagName}>` : `<${tagName}>`);
    } else if (tagName === "p" || tagName === "div") {
      output.push(isClosingTag ? "</p>" : "<p>");
    } else if (tagName === "a") {
      if (isClosingTag) {
        output.push("</a>");
      } else {
        const href = rawTag.match(/\shref=(["'])(.*?)\1/i)?.[2] ?? "";

        if (isSafeReplyHref(href)) {
          output.push(`<a href="${escapeHtml(href)}">`);
        }
      }
    } else if (tagName === "span" || tagName === "font") {
      if (isClosingTag) {
        if (openColorSpanCount > 0) {
          output.push("</span>");
          openColorSpanCount -= 1;
        }
      } else {
        const color = getSubmittedReplyTextColor(rawTag);

        if (color) {
          output.push(`<span style="color: ${color}">`);
          openColorSpanCount += 1;
        }
      }
    }

    lastIndex = index + rawTag.length;
  }

  if (lastIndex < html.length) {
    output.push(escapeSubmittedHtmlText(html.slice(lastIndex)));
  }

  return output.join("");
}

export async function saveTicketViewPreference(formData: FormData) {
  const actor = await requireTicketUser();
  const preferences = normalizeTicketPreference(formData);
  const viewKey = getTicketPreferenceViewKey(preferences.view ?? null);
  const existingPreference = await prisma.userPagePreference.findUnique({
    where: {
      userId_pageKey: {
        userId: actor.id,
        pageKey: ticketPreferencePageKey,
      },
    },
    select: {
      preferences: true,
    },
  });
  const storedPreferences = normalizeStoredTicketPreference(
    existingPreference?.preferences,
  );

  storedPreferences.views[viewKey] = preferences;

  await prisma.userPagePreference.upsert({
    where: {
      userId_pageKey: {
        userId: actor.id,
        pageKey: ticketPreferencePageKey,
      },
    },
    create: {
      userId: actor.id,
      pageKey: ticketPreferencePageKey,
      preferences: storedPreferences,
    },
    update: {
      preferences: storedPreferences,
    },
  });

  revalidatePath("/tickets");

  return {
    ok: true,
    message: "Your ticket list default was saved.",
  };
}

export async function clearTicketViewPreference(formData?: FormData) {
  const actor = await requireTicketUser();
  const viewKey = getTicketPreferenceViewKey(
    optionalString(formData ?? new FormData(), "view"),
  );
  const existingPreference = await prisma.userPagePreference.findUnique({
    where: {
      userId_pageKey: {
        userId: actor.id,
        pageKey: ticketPreferencePageKey,
      },
    },
    select: {
      preferences: true,
    },
  });

  if (!existingPreference) {
    revalidatePath("/tickets");

    return {
      ok: true,
      message: "Your saved ticket list default was cleared.",
    };
  }

  const storedPreferences = normalizeStoredTicketPreference(
    existingPreference.preferences,
  );

  storedPreferences.views[viewKey] = {};

  const hasRemainingPreferences = ticketPreferenceViewKeys.some((key) =>
    hasPreferenceValues(storedPreferences.views[key]),
  );

  if (hasRemainingPreferences) {
    await prisma.userPagePreference.update({
      where: {
        userId_pageKey: {
          userId: actor.id,
          pageKey: ticketPreferencePageKey,
        },
      },
      data: {
        preferences: storedPreferences,
      },
    });
  } else {
    await prisma.userPagePreference.delete({
      where: {
        userId_pageKey: {
          userId: actor.id,
          pageKey: ticketPreferencePageKey,
        },
      },
    });
  }

  revalidatePath("/tickets");

  return {
    ok: true,
    message: "Your saved ticket list default was cleared.",
  };
}

function formatNullableUser(user: { email: string; name: string | null } | null) {
  if (!user) {
    return "Unassigned";
  }

  return user.name ? `${user.name} <${user.email}>` : user.email;
}

function extractMentionHandles(body: string) {
  const handles = new Set<string>();
  const mentionPattern = /(^|[^\w.+-])@([a-zA-Z0-9][a-zA-Z0-9._+-]{0,63})\b/g;

  for (const match of body.matchAll(mentionPattern)) {
    handles.add(match[2].toLowerCase());
  }

  return Array.from(handles);
}

function mentionAliasesForUser(user: { email: string; name: string | null }) {
  const aliases = new Set<string>();
  const emailLocalPart = user.email.split("@")[0]?.toLowerCase();

  if (emailLocalPart) {
    aliases.add(emailLocalPart);

    emailLocalPart
      .split(/[+._-]+/)
      .filter(Boolean)
      .forEach((part) => aliases.add(part));
  }

  if (user.name) {
    const normalizedName = user.name.toLowerCase().trim();

    if (normalizedName) {
      aliases.add(normalizedName.replace(/\s+/g, "."));
      aliases.add(normalizedName.replace(/[^a-z0-9]+/g, ""));
    }

    normalizedName
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .forEach((part) => aliases.add(part));
  }

  return aliases;
}

async function resolveMentionedUsers(
  body: string,
  actorId: string,
  mentionedUserIds: string[] = [],
) {
  const handles = extractMentionHandles(body);
  const mentionedUserIdSet = new Set(
    mentionedUserIds.map((id) => id.trim()).filter(Boolean),
  );

  if (handles.length === 0 && mentionedUserIdSet.size === 0) {
    return [];
  }

  const handleSet = new Set(handles);
  const users = await prisma.user.findMany({
    where: {
      id: {
        not: actorId,
      },
      isActive: true,
      role: {
        not: UserRole.GUEST,
      },
    },
    select: {
      email: true,
      id: true,
      name: true,
    },
  });

  return users.filter((user) => {
    if (mentionedUserIdSet.has(user.id)) {
      return true;
    }

    const aliases = mentionAliasesForUser(user);
    return Array.from(handleSet).some((handle) => aliases.has(handle));
  });
}

async function sendInternalMentionNotification({
  actorEmail,
  actorName,
  mentionedUserEmail,
  mentionedUserName,
  noteBody,
  ticketId,
  ticketNumber,
  ticketSubject,
}: {
  actorEmail: string;
  actorName: string | null;
  mentionedUserEmail: string;
  mentionedUserName: string | null;
  noteBody: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
}) {
  const ticketUrl = buildTicketUrl(ticketId);
  const actorLabel = actorName ? `${actorName} <${actorEmail}>` : actorEmail;
  const mentionedUserLabel = mentionedUserName ?? mentionedUserEmail;

  try {
    const result = await sendSupportEmail({
      headers: [
        {
          Name: "X-Suppertime-Notification",
          Value: "internal-note-mention",
        },
        {
          Name: "X-Suppertime-Ticket-ID",
          Value: ticketId,
        },
      ],
      metadata: {
        notification: "internal-note-mention",
        ticketId,
        ticketNumber: String(ticketNumber),
      },
      subject: `You were mentioned on ticket #${ticketNumber}: ${ticketSubject}`,
      textBody: [
        `Hi ${mentionedUserLabel},`,
        "",
        `${actorLabel} mentioned you in an internal note on ticket #${ticketNumber}.`,
        "",
        `Subject: ${ticketSubject}`,
        `Ticket link: ${ticketUrl}`,
        "",
        "Internal note:",
        noteBody,
      ].join("\n"),
      to: mentionedUserEmail,
    });

    if (result.skipped) {
      await recordSystemNote(
        ticketId,
        `Mention notification to ${mentionedUserEmail} was skipped: ${result.reason}`,
      );
    }
  } catch (error) {
    await recordSystemNote(
      ticketId,
      `Mention notification to ${mentionedUserEmail} failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

async function cleanupStoredAttachmentKeys(storageKeys: string[]) {
  if (storageKeys.length === 0) {
    return;
  }

  try {
    await deleteStoredAttachments(storageKeys);
  } catch (error) {
    console.warn("[attachments] failed to delete stored objects", {
      error: error instanceof Error ? error.message : String(error),
      storageKeys,
    });
  }
}

export async function createTicket(formData: FormData) {
  const actor = await requireTicketUser();
  const customerEmail = requiredString(formData, "customerEmail").toLowerCase();
  const customerName = optionalString(formData, "customerName");
  const subject = requiredString(formData, "subject");
  const description = optionalString(formData, "description");
  const submittedDescriptionHtml = optionalString(formData, "descriptionHtml");
  const descriptionHtml =
    description && submittedDescriptionHtml
      ? sanitizeSubmittedReplyHtml(submittedDescriptionHtml)
      : null;
  const priority = String(formData.get("priority") ?? TicketPriority.NORMAL) as TicketPriorityValue;
  const assignedToValue = optionalString(formData, "assignedToId");
  const assignedToId =
    assignedToValue === "unassigned" ? null : (assignedToValue ?? actor.id);

  if (!validPriorities.has(priority)) {
    throw new Error("Invalid priority.");
  }

  const ticket = await prisma.$transaction(async (tx) => {
    if (assignedToId) {
      const assignee = await tx.user.findFirst({
        where: {
          id: assignedToId,
          isActive: true,
          role: {
            in: [UserRole.SUPER_ADMIN, UserRole.MANAGER, UserRole.AGENT],
          },
        },
        select: {
          id: true,
        },
      });

      if (!assignee) {
        throw new Error("Invalid assignee.");
      }
    }

    const customer = await tx.customer.upsert({
      where: {
        email: customerEmail,
      },
      create: {
        email: customerEmail,
        name: customerName,
      },
      update: {
        name: customerName ?? undefined,
      },
    });

    const messageCreatedAt = new Date();
    const created = await tx.ticket.create({
      data: {
        subject,
        description,
        emailReplyToken: createEmailReplyToken(),
        lastCustomerMessageAt: description ? messageCreatedAt : undefined,
        priority,
        source: TicketSource.MANUAL,
        customerId: customer.id,
        assignedToId,
        participants: {
          create: {
            email: customer.email,
            name: customer.name,
            role: TicketParticipantRole.REQUESTER,
            customerId: customer.id,
          },
        },
        messages: description
          ? {
              create: {
                body: description,
                bodyHtml: descriptionHtml,
                authorType: MessageAuthorType.CUSTOMER,
                visibility: MessageVisibility.PUBLIC,
                customerId: customer.id,
                emailFrom: customer.name
                  ? `${customer.name} <${customer.email}>`
                  : customer.email,
                createdAt: messageCreatedAt,
              },
            }
          : undefined,
      },
      select: {
        customer: {
          select: {
            email: true,
          },
        },
        id: true,
        emailReplyToken: true,
        number: true,
        subject: true,
      },
    });

    await tx.ticketStatusHistory.create({
      data: {
        to: TicketStatus.OPEN,
        note: "Ticket created manually.",
        ticketId: created.id,
        changedById: actor.id,
      },
    });

    return created;
  });

  await sendCustomerConfirmation(
    ticket.id,
    ticket.number,
    ticket.subject,
    ticket.customer.email,
    ticket.emailReplyToken,
  );

  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

export async function saveCannedResponse(formData: FormData) {
  const actor = await requireTicketUser();
  const templateId = optionalString(formData, "templateId");
  const title = requiredString(formData, "title");
  const body = requiredString(formData, "body");
  const submittedHtmlBody = optionalString(formData, "bodyHtml");
  const ticketId = optionalString(formData, "ticketId");
  const bodyHtml = submittedHtmlBody
    ? sanitizeSubmittedReplyHtml(submittedHtmlBody)
    : renderReplyBodyHtml(body);

  if (title.length > 120) {
    throw new Error("Template title must be 120 characters or fewer.");
  }

  const existing = templateId
    ? await prisma.cannedResponse.findFirst({
        where: {
          id: templateId,
          userId: actor.id,
        },
        select: {
          id: true,
        },
      })
    : await prisma.cannedResponse.findUnique({
        where: {
          userId_title: {
            userId: actor.id,
            title,
          },
        },
        select: {
          id: true,
        },
      });

  if (templateId && !existing) {
    throw new Error("Template not found.");
  }

  const template = existing
    ? await prisma.cannedResponse.update({
        where: {
          id: existing.id,
        },
        data: {
          title,
          body,
          bodyHtml,
        },
        select: {
          id: true,
          title: true,
          body: true,
          bodyHtml: true,
        },
      })
    : await prisma.cannedResponse.create({
        data: {
          title,
          body,
          bodyHtml,
          userId: actor.id,
        },
        select: {
          id: true,
          title: true,
          body: true,
          bodyHtml: true,
        },
      });

  if (ticketId) {
    revalidatePath(`/tickets/${ticketId}`);
  }
  revalidatePath("/tickets/templates");

  return template;
}

export async function deleteCannedResponse(formData: FormData) {
  const actor = await requireTicketUser();
  const templateId = requiredString(formData, "templateId");
  const ticketId = optionalString(formData, "ticketId");

  await prisma.cannedResponse.deleteMany({
    where: {
      id: templateId,
      userId: actor.id,
    },
  });

  if (ticketId) {
    revalidatePath(`/tickets/${ticketId}`);
  }
  revalidatePath("/tickets/templates");
}

export async function addInternalNote(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const body = requiredString(formData, "body");
  const submittedHtmlBody = optionalString(formData, "bodyHtml");
  const bodyHtml = submittedHtmlBody
    ? sanitizeSubmittedReplyHtml(submittedHtmlBody)
    : null;
  const mentionedUserIds = formData
    .getAll("mentionedUserId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const ticket = await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({
      data: {
        ticketId,
        body,
        bodyHtml,
        authorType: MessageAuthorType.AGENT,
        visibility: MessageVisibility.INTERNAL,
        agentId: actor.id,
      },
    });

    return tx.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        updatedAt: new Date(),
      },
      select: {
        id: true,
        number: true,
        subject: true,
      },
    });
  });

  const mentionedUsers = await resolveMentionedUsers(
    body,
    actor.id,
    mentionedUserIds,
  );

  await Promise.all(
    mentionedUsers.map((mentionedUser) =>
      sendInternalMentionNotification({
        actorEmail: actor.email,
        actorName: actor.name,
        mentionedUserEmail: mentionedUser.email,
        mentionedUserName: mentionedUser.name,
        noteBody: body,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
      }),
    ),
  );

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

export async function addPublicReply(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const body = requiredString(formData, "body");

  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId,
    },
    include: {
      customer: {
        select: {
          email: true,
          name: true,
        },
      },
      participants: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const emailReplyToken = ticket.emailReplyToken ?? createEmailReplyToken();

  if (!ticket.emailReplyToken) {
    await prisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        emailReplyToken,
      },
    });
  }

  const replyTo = buildTicketReplyAddress(ticket.id, emailReplyToken);
  const primaryRecipientEmail = ticket.customer.email.toLowerCase();
  const directToEmails = parseEmailFormValues(formData.getAll("toEmail"));
  const selectedToParticipantIds = new Set(
    formData.getAll("toParticipantId").map((value) => String(value)),
  );
  const selectedToEmails = ticket.participants
    .filter(
      (participant) =>
        participant.role === TicketParticipantRole.TO &&
        selectedToParticipantIds.has(participant.id),
    )
    .map((participant) => participant.email.toLowerCase());
  const toEmails = Array.from(
    new Set([
      ...(directToEmails.length > 0 ? directToEmails : [primaryRecipientEmail]),
      ...selectedToEmails,
    ]),
  );
  const selectedCcParticipantIds = new Set(
    formData.getAll("ccParticipantId").map((value) => String(value)),
  );
  const selectedCcEmails = ticket.participants
    .filter(
      (participant) =>
        participant.role === TicketParticipantRole.CC &&
        selectedCcParticipantIds.has(participant.id),
    )
    .map((participant) => participant.email.toLowerCase());
  const additionalCcEmails = parseEmailList(
    optionalString(formData, "additionalCc"),
  );
  const directCcEmails = parseEmailFormValues(formData.getAll("ccEmail"));
  const toEmailSet = new Set(toEmails);
  const ccEmails = Array.from(
    new Set([...directCcEmails, ...selectedCcEmails, ...additionalCcEmails]),
  ).filter((email) => !toEmailSet.has(email));
  const additionalBccEmails = parseEmailList(
    optionalString(formData, "additionalBcc"),
  );
  const visibleRecipientSet = new Set([...toEmails, ...ccEmails]);
  const bccEmails = Array.from(new Set(additionalBccEmails)).filter(
    (email) => !visibleRecipientSet.has(email),
  );

  if (toEmails.length === 0) {
    throw new Error("Add at least one recipient.");
  }

  for (const email of toEmails) {
    assertValidEmail(email);
  }

  for (const email of ccEmails) {
    assertValidEmail(email);
  }

  for (const email of bccEmails) {
    assertValidEmail(email);
  }

  const toRecipients = toEmails.join(",");
  const ccRecipients = ccEmails.length > 0 ? ccEmails.join(",") : null;
  const bccRecipients = bccEmails.length > 0 ? bccEmails.join(",") : null;
  const submittedHtmlBody = optionalString(formData, "bodyHtml");
  const htmlBody = submittedHtmlBody
    ? sanitizeSubmittedReplyHtml(submittedHtmlBody)
    : renderReplyBodyHtml(body);
  const subject = ticket.subject.startsWith("Re:")
    ? ticket.subject
    : `Re: ${ticket.subject}`;
  const attachments = await formDataFilesToPendingAttachments(
    formData.getAll("attachments"),
  );
  const messageId = randomUUID();
  const storedAttachments =
    attachments.length > 0
      ? await uploadTicketAttachments({
          attachments,
          messageId,
          ticketId: ticket.id,
        })
      : [];
  const result = await sendSupportEmail({
    attachments: pendingAttachmentsToPostmarkAttachments(attachments),
    bcc: bccRecipients,
    cc: ccRecipients,
    headers: [
      {
        Name: "X-Suppertime-Ticket-ID",
        Value: ticket.id,
      },
      {
        Name: "X-Suppertime-Ticket-Number",
        Value: String(ticket.number),
      },
    ],
    metadata: {
      ticketId: ticket.id,
      ticketNumber: String(ticket.number),
    },
    replyTo,
    subject,
    htmlBody,
    textBody: body,
    to: toRecipients,
  }).catch(async (error) => {
    await deleteStoredAttachments(
      storedAttachments.map((attachment) => attachment.storageKey),
    ).catch(() => undefined);
    throw error;
  });

  if (result.skipped) {
    await deleteStoredAttachments(
      storedAttachments.map((attachment) => attachment.storageKey),
    ).catch(() => undefined);
    await recordSystemNote(
      ticket.id,
      `Outbound reply was not sent: ${result.reason}`,
    );
    throw new Error(result.reason);
  }

  const messageCreatedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const email of additionalCcEmails) {
      if (toEmailSet.has(email)) {
        continue;
      }

      const customer = await tx.customer.upsert({
        where: {
          email,
        },
        create: {
          email,
        },
        update: {},
      });

      await tx.ticketParticipant.upsert({
        where: {
          ticketId_email: {
            ticketId: ticket.id,
            email,
          },
        },
        create: {
          ticketId: ticket.id,
          customerId: customer.id,
          email,
          role: TicketParticipantRole.CC,
        },
        update: {
          customerId: customer.id,
          role: TicketParticipantRole.CC,
        },
      });
    }

    await tx.ticketMessage.create({
      data: {
        id: messageId,
        ticketId: ticket.id,
        body,
        authorType: MessageAuthorType.AGENT,
        visibility: MessageVisibility.PUBLIC,
        agentId: actor.id,
        emailMessageId: result.messageId,
        emailFrom: actor.name ? `${actor.name} <${actor.email}>` : actor.email,
        emailTo: toRecipients,
        emailCc: ccRecipients,
        bodyHtml: htmlBody,
        createdAt: messageCreatedAt,
      },
    });

    if (storedAttachments.length > 0) {
      await tx.attachment.createMany({
        data: storedAttachments.map((attachment) => ({
          ...attachment,
          messageId,
          ticketId: ticket.id,
        })),
      });
    }

    await tx.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        emailThreadId: ticket.emailThreadId ?? result.messageId,
        lastAgentMessageAt: messageCreatedAt,
        updatedAt: messageCreatedAt,
      },
    });
  });

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
}

export async function forwardTicket(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const toRecipients = parseEmailList(requiredString(formData, "to"));
  const note = optionalString(formData, "note");
  const submittedNoteHtml = optionalString(formData, "noteHtml");
  const noteHtml =
    note && submittedNoteHtml
      ? sanitizeSubmittedReplyHtml(submittedNoteHtml)
      : null;
  const mode = requiredString(formData, "mode");
  const subject =
    optionalString(formData, "subject") ?? "Forwarded support ticket";

  if (toRecipients.length === 0) {
    throw new Error("Add at least one recipient email address.");
  }

  toRecipients.forEach(assertValidEmail);

  if (!validForwardModes.has(mode)) {
    throw new Error("Invalid forward mode.");
  }

  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId,
    },
    include: {
      assignedTo: {
        select: {
          email: true,
          name: true,
        },
      },
      customer: true,
      messages: {
        orderBy: {
          createdAt: "asc",
        },
        include: {
          agent: {
            select: {
              email: true,
              name: true,
            },
          },
          customer: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const modeLabel = forwardModeLabels[mode as keyof typeof forwardModeLabels];
  console.info(`${forwardLogPrefix} sending ticket forward`, {
    mode,
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    to: toRecipients,
  });

  const forwardedTicket = {
    assignedTo: ticket.assignedTo,
    customer: ticket.customer,
    description: ticket.description,
    id: ticket.id,
    messages: ticket.messages,
    number: ticket.number,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
  };
  const textBody = buildForwardedTicketBody({
    mode,
    note,
    ticket: forwardedTicket,
  });
  const htmlBody = noteHtml
    ? buildForwardedTicketHtmlBody({
        mode,
        noteHtml,
        ticket: forwardedTicket,
        textBody,
      })
    : undefined;
  const emailReplyToken = ticket.emailReplyToken ?? createEmailReplyToken();

  if (!ticket.emailReplyToken) {
    await prisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        emailReplyToken,
      },
    });
  }

  const result = await sendSupportEmail({
    headers: [
      {
        Name: "X-Suppertime-Ticket-ID",
        Value: ticket.id,
      },
      {
        Name: "X-Suppertime-Ticket-Forward-Mode",
        Value: mode,
      },
    ],
    metadata: {
      forwardMode: mode,
      ticketId: ticket.id,
      ticketNumber: String(ticket.number),
    },
    replyTo: buildTicketReplyAddress(ticket.id, emailReplyToken),
    subject,
    htmlBody,
    textBody,
    to: toRecipients.join(", "),
  });

  if (result.skipped) {
    console.warn(`${forwardLogPrefix} skipped ticket forward`, {
      reason: result.reason,
      ticketId: ticket.id,
      to: toRecipients,
    });

    throw new Error(result.reason);
  }

  console.info(`${forwardLogPrefix} Postmark accepted ticket forward`, {
    messageId: result.messageId,
    ticketId: ticket.id,
    to: toRecipients,
  });

  const recipientList = toRecipients.join(", ");

  await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        body: [
          `Forwarded ticket to ${recipientList}.`,
          "",
          `Mode: ${modeLabel}`,
          note ? ["", "Note:", note].join("\n") : null,
        ]
          .filter(Boolean)
          .join("\n"),
        bodyHtml: noteHtml
          ? [
              `<p>${escapeHtml(`Forwarded ticket to ${recipientList}.`)}</p>`,
              `<p>${escapeHtml(`Mode: ${modeLabel}`)}</p>`,
              "<p><strong>Note:</strong></p>",
              noteHtml,
            ].join("")
          : null,
        authorType: MessageAuthorType.AGENT,
        visibility: MessageVisibility.INTERNAL,
        agentId: actor.id,
        emailMessageId: result.messageId,
        emailFrom: actor.name ? `${actor.name} <${actor.email}>` : actor.email,
        emailTo: recipientList,
      },
    });

    await tx.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        updatedAt: new Date(),
      },
    });
  });

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");

  console.info(`${forwardLogPrefix} recorded internal forward note`, {
    messageId: result.messageId,
    ticketId: ticket.id,
    to: toRecipients,
  });

  return {
    ok: true,
    message: `Ticket forwarded to ${recipientList}.`,
  };
}

export async function updateTicketStatus(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const status = String(formData.get("status") ?? "") as TicketStatusValue;

  if (!validStatuses.has(status)) {
    throw new Error("Invalid status.");
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.ticket.findUnique({
      where: {
        id: ticketId,
      },
      select: {
        status: true,
      },
    });

    if (!current) {
      throw new Error("Ticket not found.");
    }

    if (current.status === status) {
      return false;
    }

    await tx.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        status,
        resolvedAt: status === TicketStatus.RESOLVED ? new Date() : undefined,
        closedAt: status === TicketStatus.CLOSED ? new Date() : undefined,
      },
    });

    await tx.ticketStatusHistory.create({
      data: {
        from: current.status,
        to: status,
        ticketId,
        changedById: actor.id,
      },
    });

    await tx.ticketMessage.create({
      data: {
        ticketId,
        authorType: MessageAuthorType.SYSTEM,
        body: `${formatActor(actor)} changed status from ${statusLabels[current.status]} to ${statusLabels[status]}.`,
        visibility: MessageVisibility.INTERNAL,
      },
    });

    return true;
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  return {
    ok: true,
    message: "Ticket status updated.",
  };
}

function getSelectedTicketIds(formData: FormData) {
  return Array.from(new Set(formData.getAll("ticketIds")))
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function canPermanentlyDeleteTickets(role: UserRole) {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.MANAGER ||
    role === UserRole.AGENT
  );
}

export async function bulkUpdateTicketStatus(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketIds = getSelectedTicketIds(formData);
  const status = String(formData.get("status") ?? "") as TicketStatusValue;

  if (
    actor.role !== UserRole.SUPER_ADMIN &&
    actor.role !== UserRole.MANAGER &&
    actor.role !== UserRole.AGENT
  ) {
    throw new Error("You do not have permission to bulk update tickets.");
  }

  if (ticketIds.length === 0) {
    throw new Error("Select at least one ticket.");
  }

  if (!validStatuses.has(status)) {
    throw new Error("Invalid status.");
  }

  const now = new Date();
  const tickets = await prisma.ticket.findMany({
    where: {
      id: {
        in: ticketIds,
      },
    },
    select: {
      id: true,
      status: true,
    },
  });
  const changedTickets = tickets.filter((ticket) => ticket.status !== status);

  if (changedTickets.length > 0) {
    await prisma.$transaction([
      prisma.ticket.updateMany({
        where: {
          id: {
            in: changedTickets.map((ticket) => ticket.id),
          },
        },
        data: {
          status,
          resolvedAt: status === TicketStatus.RESOLVED ? now : undefined,
          closedAt: status === TicketStatus.CLOSED ? now : undefined,
        },
      }),
      prisma.ticketStatusHistory.createMany({
        data: changedTickets.map((ticket) => ({
          changedById: actor.id,
          from: ticket.status,
          ticketId: ticket.id,
          to: status,
        })),
      }),
      prisma.ticketMessage.createMany({
        data: changedTickets.map((ticket) => ({
          ticketId: ticket.id,
          authorType: MessageAuthorType.SYSTEM,
          body: `${formatActor(actor)} changed status from ${statusLabels[ticket.status]} to ${statusLabels[status]}.`,
          visibility: MessageVisibility.INTERNAL,
        })),
      }),
    ]);
  }

  revalidatePath("/tickets");

  return {
    ok: true,
    message:
      changedTickets.length === 1
        ? "Updated 1 ticket."
        : `Updated ${changedTickets.length} tickets.`,
  };
}

export async function updateTicketPriority(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const priority = String(formData.get("priority") ?? "") as TicketPriorityValue;

  if (!validPriorities.has(priority)) {
    throw new Error("Invalid priority.");
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.ticket.findUnique({
      where: {
        id: ticketId,
      },
      select: {
        priority: true,
      },
    });

    if (!current) {
      throw new Error("Ticket not found.");
    }

    if (current.priority === priority) {
      return;
    }

    await tx.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        priority,
      },
    });

    await tx.ticketMessage.create({
      data: {
        ticketId,
        authorType: MessageAuthorType.SYSTEM,
        body: `${formatActor(actor)} changed priority from ${priorityLabels[current.priority]} to ${priorityLabels[priority]}.`,
        visibility: MessageVisibility.INTERNAL,
      },
    });
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  return {
    ok: true,
    message: "Ticket priority updated.",
  };
}

export async function updateTicketAssignment(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const assignedToId = optionalString(formData, "assignedToId");

  const ticket = await prisma.$transaction(async (tx) => {
    const current = await tx.ticket.findUnique({
      where: {
        id: ticketId,
      },
      select: {
        assignedToId: true,
        assignedTo: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!current) {
      throw new Error("Ticket not found.");
    }

    const updated = await tx.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        assignedToId,
      },
      select: {
        assignedTo: {
          select: {
            email: true,
            id: true,
            name: true,
          },
        },
        id: true,
        number: true,
        subject: true,
      },
    });

    if (current.assignedToId !== assignedToId) {
      await tx.ticketMessage.create({
        data: {
          ticketId,
          authorType: MessageAuthorType.SYSTEM,
          body: `${formatActor(actor)} changed assignee from ${formatNullableUser(current.assignedTo)} to ${formatNullableUser(updated.assignedTo)}.`,
          visibility: MessageVisibility.INTERNAL,
        },
      });
    }

    return {
      ...updated,
      previousAssignedToId: current.assignedToId,
    };
  });

  if (
    assignedToId &&
    assignedToId !== actor.id &&
    assignedToId !== ticket.previousAssignedToId &&
    ticket.assignedTo
  ) {
    await sendAssignmentNotification({
      actorEmail: actor.email,
      actorName: actor.name,
      assigneeEmail: ticket.assignedTo.email,
      assigneeName: ticket.assignedTo.name,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      ticketSubject: ticket.subject,
    });
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");

  return {
    ok: true,
    message: assignedToId ? "Ticket assigned." : "Ticket unassigned.",
  };
}

async function sendAssignmentNotification({
  actorEmail,
  actorName,
  assigneeEmail,
  assigneeName,
  ticketId,
  ticketNumber,
  ticketSubject,
}: {
  actorEmail: string;
  actorName: string | null;
  assigneeEmail: string;
  assigneeName: string | null;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
}) {
  const ticketUrl = buildTicketUrl(ticketId);
  const actorLabel = actorName ? `${actorName} <${actorEmail}>` : actorEmail;
  const assigneeLabel = assigneeName ?? assigneeEmail;

  try {
    const result = await sendSupportEmail({
      headers: [
        {
          Name: "X-Suppertime-Notification",
          Value: "ticket-assignment",
        },
        {
          Name: "X-Suppertime-Ticket-ID",
          Value: ticketId,
        },
      ],
      metadata: {
        notification: "ticket-assignment",
        ticketId,
        ticketNumber: String(ticketNumber),
      },
      subject: `Ticket #${ticketNumber} assigned to you: ${ticketSubject}`,
      textBody: [
        `Hi ${assigneeLabel},`,
        "",
        `${actorLabel} assigned ticket #${ticketNumber} to you.`,
        "",
        `Subject: ${ticketSubject}`,
        `Ticket link: ${ticketUrl}`,
      ].join("\n"),
      to: assigneeEmail,
    });

    if (result.skipped) {
      await recordSystemNote(
        ticketId,
        `Assignment notification to ${assigneeEmail} was skipped: ${result.reason}`,
      );
    }
  } catch (error) {
    await recordSystemNote(
      ticketId,
      `Assignment notification to ${assigneeEmail} failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export async function deleteClosedTicket(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");

  if (!canPermanentlyDeleteTickets(actor.role)) {
    throw new Error("You do not have permission to permanently delete tickets.");
  }

  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId,
    },
    select: {
      attachments: {
        select: {
          storageKey: true,
        },
      },
      id: true,
      number: true,
      status: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  if (ticket.status !== TicketStatus.CLOSED) {
    throw new Error("Only closed tickets can be permanently deleted.");
  }

  await prisma.ticket.delete({
    where: {
      id: ticket.id,
    },
  });
  await cleanupStoredAttachmentKeys(
    ticket.attachments.map((attachment) => attachment.storageKey),
  );

  console.info("[ticket-delete] permanently deleted closed ticket", {
    actorId: actor.id,
    ticketId: ticket.id,
    ticketNumber: ticket.number,
  });

  revalidatePath("/tickets");

  return {
    ok: true,
    message: `Ticket #${ticket.number} was permanently deleted.`,
  };
}

export async function bulkDeleteClosedTickets(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketIds = getSelectedTicketIds(formData);

  if (!canPermanentlyDeleteTickets(actor.role)) {
    throw new Error("You do not have permission to permanently delete tickets.");
  }

  if (ticketIds.length === 0) {
    throw new Error("Select at least one ticket.");
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      id: {
        in: ticketIds,
      },
    },
    select: {
      attachments: {
        select: {
          storageKey: true,
        },
      },
      id: true,
      number: true,
      status: true,
    },
  });
  const closedTickets = tickets.filter(
    (ticket) => ticket.status === TicketStatus.CLOSED,
  );
  const skippedCount = ticketIds.length - closedTickets.length;

  if (closedTickets.length > 0) {
    await prisma.ticket.deleteMany({
      where: {
        id: {
          in: closedTickets.map((ticket) => ticket.id),
        },
      },
    });
    await cleanupStoredAttachmentKeys(
      closedTickets.flatMap((ticket) =>
        ticket.attachments.map((attachment) => attachment.storageKey),
      ),
    );
  }

  console.info("[ticket-delete] bulk deleted closed tickets", {
    actorId: actor.id,
    deletedCount: closedTickets.length,
    skippedCount,
    ticketIds: closedTickets.map((ticket) => ticket.id),
    ticketNumbers: closedTickets.map((ticket) => ticket.number),
  });

  revalidatePath("/tickets");

  const deletedMessage =
    closedTickets.length === 1
      ? "Deleted 1 closed ticket"
      : `Deleted ${closedTickets.length} closed tickets`;
  const skippedMessage =
    skippedCount > 0
      ? ` ${skippedCount} selected ${skippedCount === 1 ? "ticket was" : "tickets were"} not closed and were skipped.`
      : "";

  return {
    ok: true,
    message: `${deletedMessage}.${skippedMessage}`,
  };
}

export async function addTicketTag(formData: FormData) {
  await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const tagName = requiredString(formData, "tagName").toLowerCase();

  const tag = await prisma.tag.upsert({
    where: {
      name: tagName,
    },
    create: {
      name: tagName,
    },
    update: {},
  });

  await prisma.ticketTag.upsert({
    where: {
      ticketId_tagId: {
        ticketId,
        tagId: tag.id,
      },
    },
    create: {
      ticketId,
      tagId: tag.id,
    },
    update: {},
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

export async function removeTicketTag(formData: FormData) {
  await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const tagId = requiredString(formData, "tagId");

  await prisma.ticketTag.delete({
    where: {
      ticketId_tagId: {
        ticketId,
        tagId,
      },
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
}

async function sendCustomerConfirmation(
  ticketId: string,
  ticketNumber: number,
  ticketSubject: string,
  customerEmail: string,
  emailReplyToken: string | null,
) {
  if (!isSupportAutoReplyEnabled()) {
    await recordSystemNote(
      ticketId,
      "Customer confirmation auto-reply skipped because SUPPORT_AUTO_REPLY_ENABLED=false.",
    );
    return;
  }

  try {
    const result = await sendSupportEmail({
      metadata: {
        ticketId,
        ticketNumber: String(ticketNumber),
      },
      headers: getAutomatedReplyHeaders(),
      replyTo: emailReplyToken
        ? buildTicketReplyAddress(ticketId, emailReplyToken)
        : null,
      subject: buildCustomerConfirmationSubject(ticketNumber),
      textBody: buildCustomerConfirmationText(ticketNumber, ticketSubject),
      to: customerEmail,
    });

    if (result.skipped) {
      return;
    }

    await prisma.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        emailThreadId: result.messageId,
      },
    });
  } catch (error) {
    await recordSystemNote(
      ticketId,
      `Customer confirmation email failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

function buildForwardedTicketBody({
  mode,
  note,
  ticket,
}: {
  mode: string;
  note: string | null;
  ticket: {
    assignedTo: { email: string; name: string | null } | null;
    customer: { email: string; name: string | null };
    description: string | null;
    id: string;
    messages: Array<{
      authorType: MessageAuthorType;
      body: string;
      createdAt: Date;
      emailCc: string | null;
      emailFrom: string | null;
      emailTo: string | null;
      visibility: MessageVisibility;
      agent: { email: string; name: string | null } | null;
      customer: { email: string; name: string | null } | null;
    }>;
    number: number;
    priority: TicketPriorityValue;
    status: TicketStatusValue;
    subject: string;
  };
}) {
  const sections = [
    note ? ["Note:", note, ""].join("\n") : null,
    `Ticket #${ticket.number}: ${ticket.subject}`,
    `Status: ${statusLabels[ticket.status]}`,
    `Priority: ${priorityLabels[ticket.priority]}`,
    `Customer: ${ticket.customer.name ?? ticket.customer.email} <${ticket.customer.email}>`,
    `Assignee: ${
      ticket.assignedTo
        ? `${ticket.assignedTo.name ?? ticket.assignedTo.email} <${ticket.assignedTo.email}>`
        : "Unassigned"
    }`,
    `Link: ${buildTicketUrl(ticket.id)}`,
  ];

  if (mode === "latest_customer") {
    const latestCustomerMessage = [...ticket.messages]
      .reverse()
      .find(
        (message) =>
          message.visibility === MessageVisibility.PUBLIC &&
          message.authorType === MessageAuthorType.CUSTOMER,
      );

    sections.push(
      "",
      "Latest customer response:",
      latestCustomerMessage
        ? formatForwardedMessage(latestCustomerMessage)
        : "No public customer response was found.",
    );
  }

  if (mode === "public_thread") {
    const publicMessages = ticket.messages.filter(
      (message) =>
        message.visibility === MessageVisibility.PUBLIC &&
        (message.authorType === MessageAuthorType.CUSTOMER ||
          message.authorType === MessageAuthorType.AGENT),
    );
    const description = normalizeForwardedBody(ticket.description);
    const firstPublicBody = normalizeForwardedBody(publicMessages[0]?.body);
    const threadParts = [
      description && description !== firstPublicBody
        ? ["Initial ticket description:", description].join("\n")
        : null,
      ...publicMessages.map(formatForwardedMessage),
    ].filter(Boolean);

    sections.push(
      "",
      "Public thread:",
      threadParts.length > 0
        ? threadParts.join("\n\n---\n\n")
        : "No public messages were found.",
    );
  }

  return sections.filter(Boolean).join("\n");
}

function buildForwardedTicketHtmlBody({
  mode,
  noteHtml,
  textBody,
  ticket,
}: {
  mode: string;
  noteHtml: string;
  textBody: string;
  ticket: Parameters<typeof buildForwardedTicketBody>[0]["ticket"];
}) {
  if (mode !== "link") {
    return textToHtml(textBody);
  }

  const assignee = ticket.assignedTo
    ? `${ticket.assignedTo.name ?? ticket.assignedTo.email} <${ticket.assignedTo.email}>`
    : "Unassigned";
  const summaryLines = [
    `Ticket #${ticket.number}: ${ticket.subject}`,
    `Status: ${statusLabels[ticket.status]}`,
    `Priority: ${priorityLabels[ticket.priority]}`,
    `Customer: ${ticket.customer.name ?? ticket.customer.email} <${ticket.customer.email}>`,
    `Assignee: ${assignee}`,
    `Link: ${buildTicketUrl(ticket.id)}`,
  ];

  return [
    "<p><strong>Note:</strong></p>",
    noteHtml,
    "<p>",
    summaryLines.map(escapeHtml).join("<br>"),
    "</p>",
  ].join("");
}

function formatForwardedMessage(message: {
  authorType: MessageAuthorType;
  body: string;
  createdAt: Date;
  emailCc: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  agent: { email: string; name: string | null } | null;
  customer: { email: string; name: string | null } | null;
}) {
  const recipients = [
    message.emailTo ? `To: ${message.emailTo}` : null,
    message.emailCc ? `CC: ${message.emailCc}` : null,
  ].filter(Boolean);

  return [
    `${formatForwardedAuthor(message)} - ${message.createdAt.toLocaleString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    )}`,
    ...recipients,
    message.body,
  ].join("\n");
}

function formatForwardedAuthor(message: {
  authorType: MessageAuthorType;
  emailFrom: string | null;
  agent: { email: string; name: string | null } | null;
  customer: { email: string; name: string | null } | null;
}) {
  if (message.emailFrom) {
    return message.emailFrom;
  }

  if (message.authorType === MessageAuthorType.CUSTOMER) {
    return message.customer
      ? formatActor(message.customer)
      : "Customer";
  }

  if (message.authorType === MessageAuthorType.AGENT) {
    return message.agent ? formatActor(message.agent) : "Agent";
  }

  return "System";
}

function normalizeForwardedBody(body: string | null | undefined) {
  return (body ?? "").replace(/\r\n/g, "\n").trim();
}

async function recordSystemNote(ticketId: string, body: string) {
  await prisma.ticketMessage.create({
    data: {
      ticketId,
      body,
      authorType: MessageAuthorType.SYSTEM,
      visibility: MessageVisibility.INTERNAL,
    },
  });
}
