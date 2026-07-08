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
  buildTicketReplyAddress,
  createEmailReplyToken,
  getAutomatedReplyHeaders,
  isSupportAutoReplyEnabled,
  sendSupportEmail,
} from "@/lib/support-email";

const validStatuses = new Set<TicketStatusValue>(Object.values(TicketStatus));
const validPriorities = new Set<TicketPriorityValue>(Object.values(TicketPriority));
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

function parseEmailList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function assertValidEmail(email: string) {
  if (!emailPattern.test(email)) {
    throw new Error(`Invalid email address: ${email}`);
  }
}

function formatActor(actor: { email: string; name: string | null }) {
  return actor.name ? `${actor.name} <${actor.email}>` : actor.email;
}

function formatNullableUser(user: { email: string; name: string | null } | null) {
  if (!user) {
    return "Unassigned";
  }

  return user.name ? `${user.name} <${user.email}>` : user.email;
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
  const priority = String(formData.get("priority") ?? TicketPriority.NORMAL) as TicketPriorityValue;

  if (!validPriorities.has(priority)) {
    throw new Error("Invalid priority.");
  }

  const ticket = await prisma.$transaction(async (tx) => {
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

    const created = await tx.ticket.create({
      data: {
        subject,
        description,
        emailReplyToken: createEmailReplyToken(),
        priority,
        source: TicketSource.MANUAL,
        customerId: customer.id,
        assignedToId: actor.id,
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
                authorType: MessageAuthorType.AGENT,
                visibility: MessageVisibility.INTERNAL,
                agentId: actor.id,
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

export async function addInternalNote(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const body = requiredString(formData, "body");

  await prisma.ticketMessage.create({
    data: {
      ticketId,
      body,
      authorType: MessageAuthorType.AGENT,
      visibility: MessageVisibility.INTERNAL,
      agentId: actor.id,
    },
  });

  await prisma.ticket.update({
    where: {
      id: ticketId,
    },
    data: {
      updatedAt: new Date(),
    },
  });

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
  const additionalCcEmails = parseEmailList(optionalString(formData, "additionalCc"));
  const ccEmails = Array.from(
    new Set([...selectedCcEmails, ...additionalCcEmails]),
  ).filter((email) => email !== ticket.customer.email.toLowerCase());

  for (const email of ccEmails) {
    assertValidEmail(email);
  }

  const ccRecipients = ccEmails.length > 0 ? ccEmails.join(",") : null;
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
    textBody: body,
    to: ticket.customer.email,
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

  await prisma.$transaction(async (tx) => {
    for (const email of additionalCcEmails) {
      if (email === ticket.customer.email.toLowerCase()) {
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
        emailTo: ticket.customer.email,
        emailCc: ccRecipients,
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
        updatedAt: new Date(),
      },
    });
  });

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
}

export async function forwardTicket(formData: FormData) {
  const actor = await requireTicketUser();
  const ticketId = requiredString(formData, "ticketId");
  const to = requiredString(formData, "to");
  const note = optionalString(formData, "note");
  const mode = requiredString(formData, "mode");
  const subject =
    optionalString(formData, "subject") ?? "Forwarded support ticket";

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
    to,
  });

  const textBody = buildForwardedTicketBody({
    mode,
    note,
    ticket: {
      assignedTo: ticket.assignedTo,
      customer: ticket.customer,
      description: ticket.description,
      id: ticket.id,
      messages: ticket.messages,
      number: ticket.number,
      priority: ticket.priority,
      status: ticket.status,
      subject: ticket.subject,
    },
  });
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
    textBody,
    to,
  });

  if (result.skipped) {
    console.warn(`${forwardLogPrefix} skipped ticket forward`, {
      reason: result.reason,
      ticketId: ticket.id,
      to,
    });

    throw new Error(result.reason);
  }

  console.info(`${forwardLogPrefix} Postmark accepted ticket forward`, {
    messageId: result.messageId,
    ticketId: ticket.id,
    to,
  });

  await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        body: [
          `Forwarded ticket to ${to}.`,
          "",
          `Mode: ${modeLabel}`,
          note ? ["", "Note:", note].join("\n") : null,
        ]
          .filter(Boolean)
          .join("\n"),
        authorType: MessageAuthorType.AGENT,
        visibility: MessageVisibility.INTERNAL,
        agentId: actor.id,
        emailMessageId: result.messageId,
        emailFrom: actor.name ? `${actor.name} <${actor.email}>` : actor.email,
        emailTo: to,
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
    to,
  });

  return {
    ok: true,
    message: `Ticket forwarded to ${to}.`,
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

  if (actor.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Only super-admins can permanently delete tickets.");
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

  if (actor.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Only super-admins can permanently delete tickets.");
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
      subject: `We received your support request #${ticketNumber}`,
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
