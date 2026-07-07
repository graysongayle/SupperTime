import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  buildCustomerConfirmationText,
  buildTicketReplyAddress,
  createEmailReplyToken,
  extractTicketReplyToken,
  getAutomatedReplyHeaders,
  getPostmarkInboundWebhookSecret,
  isSupportAutoReplyEnabled,
  isSupportEmailAddress,
  messageIdVariants,
  normalizeMessageId,
  sendSupportEmail,
} from "@/lib/support-email";
import {
  MessageAuthorType,
  MessageVisibility,
  TicketParticipantRole,
  TicketSource,
  TicketStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const logPrefix = "[postmark-inbound]";

type PostmarkInboundAddress = {
  Email?: string;
  Name?: string;
};

type PostmarkInboundHeader = {
  Name?: string;
  Value?: string;
};

type PostmarkInboundAttachment = {
  ContentLength?: number;
  ContentType?: string;
  Name?: string;
};

type PostmarkInboundPayload = {
  Attachments?: PostmarkInboundAttachment[];
  Cc?: string;
  Date?: string;
  From?: string;
  FromFull?: PostmarkInboundAddress;
  Headers?: PostmarkInboundHeader[];
  HtmlBody?: string;
  MessageID?: string;
  OriginalRecipient?: string;
  ReplyTo?: string;
  StrippedTextReply?: string;
  Subject?: string;
  TextBody?: string;
  To?: string;
  ToFull?: PostmarkInboundAddress[];
  CcFull?: PostmarkInboundAddress[];
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    console.warn(`${logPrefix} rejected unauthorized webhook`, {
      hasHeaderSecret: Boolean(request.headers.get("x-postmark-webhook-secret")),
      hasQueryToken: Boolean(request.nextUrl.searchParams.get("token")),
    });

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PostmarkInboundPayload;

  try {
    payload = (await request.json()) as PostmarkInboundPayload;
  } catch (error) {
    console.error(`${logPrefix} failed to parse webhook JSON`, {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inboundMessageId = normalizeMessageId(payload.MessageID);

  try {
    console.info(`${logPrefix} received webhook`, {
      attachmentCount: payload.Attachments?.length ?? 0,
      from: payload.FromFull?.Email ?? parseEmail(payload.From),
      messageId: inboundMessageId,
      subject: payload.Subject,
    });

    if (inboundMessageId) {
      const existingMessage = await prisma.ticketMessage.findFirst({
        where: {
          emailMessageId: inboundMessageId,
        },
        select: {
          id: true,
        },
      });

      if (existingMessage) {
        console.info(`${logPrefix} skipped duplicate message`, {
          messageId: inboundMessageId,
          subject: payload.Subject,
        });

        return NextResponse.json({ status: "duplicate" });
      }
    }

    const fromEmail = payload.FromFull?.Email ?? parseEmail(payload.From);

    if (!fromEmail) {
      console.warn(`${logPrefix} rejected message without sender`, {
        messageId: inboundMessageId,
        subject: payload.Subject,
      });

      return NextResponse.json(
        { error: "Inbound message is missing a sender email." },
        { status: 400 },
      );
    }

    const automatedReason = getAutomatedInboundReason(payload);

    const matchedTicket = await findMatchingTicket(payload);
    const body =
      payload.StrippedTextReply?.trim() ||
      payload.TextBody?.trim() ||
      "No plain-text body was provided.";

    if (matchedTicket) {
      await appendInboundMessage({
        body,
        customerEmail: fromEmail,
        customerName: payload.FromFull?.Name ?? null,
        htmlBody: payload.HtmlBody ?? null,
        inboundMessageId,
        payload,
        ticketId: matchedTicket.id,
      });

      if (automatedReason) {
        await recordAutomatedInboundNote(matchedTicket.id, automatedReason);
      }

      console.info(`${logPrefix} threaded inbound message`, {
        automatedReason,
        messageId: inboundMessageId,
        subject: payload.Subject,
        ticketId: matchedTicket.id,
      });

      return NextResponse.json({
        automatedReason,
        status: "threaded",
        ticketId: matchedTicket.id,
      });
    }

    const ticket = await createInboundTicket({
      body,
      customerEmail: fromEmail,
      customerName: payload.FromFull?.Name ?? null,
      htmlBody: payload.HtmlBody ?? null,
      inboundMessageId,
      payload,
    });

    console.info(`${logPrefix} created ticket from inbound message`, {
      messageId: inboundMessageId,
      subject: payload.Subject,
      ticketId: ticket.id,
      ticketNumber: ticket.number,
    });

    if (automatedReason) {
      await recordAutomatedInboundNote(ticket.id, automatedReason);
    } else {
      await sendInboundConfirmation(
        ticket.id,
        ticket.number,
        ticket.subject,
        ticket.customerEmail,
      );
    }

    return NextResponse.json({
      automatedReason,
      status: "created",
      ticketId: ticket.id,
    });
  } catch (error) {
    console.error(`${logPrefix} failed to process webhook`, {
      error: error instanceof Error ? error.message : String(error),
      messageId: inboundMessageId,
      subject: payload.Subject,
    });

    return NextResponse.json(
      { error: "Failed to process inbound email." },
      { status: 500 },
    );
  }
}

function isAuthorized(request: NextRequest) {
  const expected = getPostmarkInboundWebhookSecret();
  const provided =
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-postmark-webhook-secret");

  return Boolean(provided && provided === expected);
}

async function findMatchingTicket(payload: PostmarkInboundPayload) {
  const tokenMatch = extractTicketReplyToken(JSON.stringify(payload));

  if (tokenMatch) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: tokenMatch.ticketId,
        emailReplyToken: tokenMatch.token,
      },
      select: {
        id: true,
      },
    });

    if (ticket) {
      return ticket;
    }
  }

  const headerMessageIds = getThreadHeaderMessageIds(payload);

  if (headerMessageIds.length === 0) {
    return null;
  }

  return prisma.ticket.findFirst({
    where: {
      OR: [
        {
          emailThreadId: {
            in: headerMessageIds,
          },
        },
        {
          messages: {
            some: {
              emailMessageId: {
                in: headerMessageIds,
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });
}

async function appendInboundMessage({
  body,
  customerEmail,
  customerName,
  htmlBody,
  inboundMessageId,
  payload,
  ticketId,
}: {
  body: string;
  customerEmail: string;
  customerName: string | null;
  htmlBody: string | null;
  inboundMessageId: string | null;
  payload: PostmarkInboundPayload;
  ticketId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: {
        email: customerEmail.toLowerCase(),
      },
      create: {
        email: customerEmail.toLowerCase(),
        name: customerName,
      },
      update: {
        name: customerName ?? undefined,
      },
    });

    await tx.ticketMessage.create({
      data: {
        ticketId,
        body,
        bodyHtml: htmlBody,
        authorType: MessageAuthorType.CUSTOMER,
        visibility: MessageVisibility.PUBLIC,
        emailMessageId: inboundMessageId,
        emailFrom: formatAddress({
          Email: customerEmail,
          Name: customerName ?? undefined,
        }),
        emailTo: formatAddresses(payload.ToFull),
        emailCc: formatAddresses(payload.CcFull),
        customerId: customer.id,
      },
    });

    await maybeRecordAttachmentNote(tx, ticketId, payload);
    await upsertParticipantsFromInbound(tx, ticketId, payload, {
      email: customerEmail,
      name: customerName,
    });

    await tx.ticket.update({
      where: {
        id: ticketId,
      },
      data: {
        updatedAt: new Date(),
      },
    });
  });
}

async function createInboundTicket({
  body,
  customerEmail,
  customerName,
  htmlBody,
  inboundMessageId,
  payload,
}: {
  body: string;
  customerEmail: string;
  customerName: string | null;
  htmlBody: string | null;
  inboundMessageId: string | null;
  payload: PostmarkInboundPayload;
}) {
  const emailReplyToken = createEmailReplyToken();
  const subject = payload.Subject?.trim() || "Support request";

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: {
        email: customerEmail.toLowerCase(),
      },
      create: {
        email: customerEmail.toLowerCase(),
        name: customerName,
      },
      update: {
        name: customerName ?? undefined,
      },
    });

    const ticket = await tx.ticket.create({
      data: {
        subject,
        description: body,
        source: TicketSource.EMAIL,
        externalId: inboundMessageId,
        emailThreadId: inboundMessageId,
        emailReplyToken,
        customerId: customer.id,
        messages: {
          create: {
            body,
            bodyHtml: htmlBody,
            authorType: MessageAuthorType.CUSTOMER,
            visibility: MessageVisibility.PUBLIC,
            emailMessageId: inboundMessageId,
            emailFrom: formatAddress({
              Email: customerEmail,
              Name: customerName ?? undefined,
            }),
            emailTo: formatAddresses(payload.ToFull),
            emailCc: formatAddresses(payload.CcFull),
            customerId: customer.id,
          },
        },
        statusHistory: {
          create: {
            to: TicketStatus.OPEN,
            note: "Ticket created from inbound email.",
          },
        },
      },
      select: {
        customer: {
          select: {
            email: true,
          },
        },
        emailReplyToken: true,
        id: true,
        number: true,
        subject: true,
      },
    });

    await upsertParticipantsFromInbound(tx, ticket.id, payload, {
      email: customerEmail,
      name: customerName,
    });

    await maybeRecordAttachmentNote(tx, ticket.id, payload);

    return {
      customerEmail: ticket.customer.email,
      emailReplyToken: ticket.emailReplyToken ?? emailReplyToken,
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
    };
  });
}

async function sendInboundConfirmation(
  ticketId: string,
  ticketNumber: number,
  ticketSubject: string,
  customerEmail: string,
) {
  if (!isSupportAutoReplyEnabled()) {
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        body: "Customer confirmation auto-reply skipped because SUPPORT_AUTO_REPLY_ENABLED=false.",
        authorType: MessageAuthorType.SYSTEM,
        visibility: MessageVisibility.INTERNAL,
      },
    });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId,
    },
    select: {
      emailReplyToken: true,
    },
  });
  const replyTo = ticket?.emailReplyToken
    ? buildTicketReplyAddress(ticketId, ticket.emailReplyToken)
    : null;

  try {
    const result = await sendSupportEmail({
      metadata: {
        ticketId,
        ticketNumber: String(ticketNumber),
      },
      headers: getAutomatedReplyHeaders(),
      replyTo,
      subject: `We received your support request #${ticketNumber}`,
      textBody: buildCustomerConfirmationText(ticketNumber, ticketSubject),
      to: customerEmail,
    });

    if (result.skipped || !result.messageId) {
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
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        body: `Customer confirmation email failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        authorType: MessageAuthorType.SYSTEM,
        visibility: MessageVisibility.INTERNAL,
      },
    });
  }
}

async function maybeRecordAttachmentNote(
  tx: Prisma.TransactionClient,
  ticketId: string,
  payload: PostmarkInboundPayload,
) {
  const attachments = payload.Attachments ?? [];

  if (attachments.length === 0) {
    return;
  }

  const names = attachments
    .map((attachment) => attachment.Name)
    .filter(Boolean)
    .join(", ");

  await tx.ticketMessage.create({
    data: {
      ticketId,
      body: `Inbound email included ${attachments.length} attachment${
        attachments.length === 1 ? "" : "s"
      }${names ? `: ${names}` : ""}. Attachment file storage is not configured yet.`,
      authorType: MessageAuthorType.SYSTEM,
      visibility: MessageVisibility.INTERNAL,
    },
  });
}

async function recordAutomatedInboundNote(ticketId: string, reason: string) {
  await prisma.ticketMessage.create({
    data: {
      ticketId,
      body: `Inbound email appears automated (${reason}). Customer confirmation auto-reply was suppressed to prevent response loops.`,
      authorType: MessageAuthorType.SYSTEM,
      visibility: MessageVisibility.INTERNAL,
    },
  });
}

function getThreadHeaderMessageIds(payload: PostmarkInboundPayload) {
  const headers = payload.Headers ?? [];
  const values = headers
    .filter((header) => {
      const name = header.Name?.toLowerCase();
      return name === "in-reply-to" || name === "references";
    })
    .flatMap((header) => header.Value?.split(/\s+/) ?? []);

  return Array.from(
    new Set(values.flatMap((value) => messageIdVariants(value))),
  );
}

function getHeaderValue(payload: PostmarkInboundPayload, headerName: string) {
  const normalizedHeaderName = headerName.toLowerCase();

  return (
    payload.Headers?.find(
      (header) => header.Name?.toLowerCase() === normalizedHeaderName,
    )?.Value?.trim() ?? null
  );
}

function getAutomatedInboundReason(payload: PostmarkInboundPayload) {
  const autoSubmitted = getHeaderValue(payload, "auto-submitted")?.toLowerCase();

  if (autoSubmitted && autoSubmitted !== "no") {
    return `auto-submitted=${autoSubmitted}`;
  }

  const precedence = getHeaderValue(payload, "precedence")?.toLowerCase();

  if (
    precedence &&
    ["auto_reply", "bulk", "junk", "list"].includes(precedence)
  ) {
    return `precedence=${precedence}`;
  }

  for (const headerName of [
    "x-autoreply",
    "x-autorespond",
    "x-auto-response-suppress",
    "x-ms-exchange-inbox-rules-loop",
    "x-ms-exchange-generated-message-source",
    "x-loop",
    "list-id",
    "list-unsubscribe",
  ]) {
    if (getHeaderValue(payload, headerName)) {
      return `${headerName} header`;
    }
  }

  const fromEmail = (payload.FromFull?.Email ?? parseEmail(payload.From) ?? "")
    .trim()
    .toLowerCase();
  const subject = payload.Subject?.trim().toLowerCase() ?? "";

  if (
    /^(mailer-daemon|postmaster|no-reply|noreply|do-not-reply|donotreply)@/.test(
      fromEmail,
    )
  ) {
    return `automated sender ${fromEmail}`;
  }

  if (
    /^(automatic reply|auto reply|autoreply|out of office|delivery status notification|undeliverable|delivery failure)\b/.test(
      subject,
    )
  ) {
    return `automated subject ${payload.Subject}`;
  }

  return null;
}

async function upsertParticipantsFromInbound(
  tx: Prisma.TransactionClient,
  ticketId: string,
  payload: PostmarkInboundPayload,
  requester: {
    email: string;
    name: string | null;
  },
) {
  const participants = [
    {
      email: requester.email,
      name: requester.name,
      role: TicketParticipantRole.REQUESTER,
    },
    ...normalizePostmarkAddresses(payload.ToFull ?? [], TicketParticipantRole.TO),
    ...normalizePostmarkAddresses(payload.CcFull ?? [], TicketParticipantRole.CC),
  ];
  const seen = new Set<string>();

  for (const participant of participants) {
    const email = participant.email.toLowerCase();

    if (!email || seen.has(email) || isSupportEmailAddress(email)) {
      continue;
    }

    seen.add(email);

    const customer = await tx.customer.upsert({
      where: {
        email,
      },
      create: {
        email,
        name: participant.name,
      },
      update: {
        name: participant.name ?? undefined,
      },
    });

    await tx.ticketParticipant.upsert({
      where: {
        ticketId_email: {
          ticketId,
          email,
        },
      },
      create: {
        ticketId,
        customerId: customer.id,
        email,
        name: participant.name,
        role: participant.role,
      },
      update: {
        customerId: customer.id,
        name: participant.name ?? undefined,
        role:
          participant.role === TicketParticipantRole.REQUESTER
            ? TicketParticipantRole.REQUESTER
            : undefined,
      },
    });
  }
}

function normalizePostmarkAddresses(
  addresses: PostmarkInboundAddress[],
  role: TicketParticipantRole,
) {
  return addresses
    .map((address) => ({
      email: address.Email?.trim().toLowerCase() ?? "",
      name: address.Name?.trim() || null,
      role,
    }))
    .filter((address) => Boolean(address.email));
}

function formatAddress(address: PostmarkInboundAddress) {
  const email = address.Email?.trim();

  if (!email) {
    return null;
  }

  const name = address.Name?.trim();
  return name ? `${name} <${email}>` : email;
}

function formatAddresses(addresses: PostmarkInboundAddress[] | undefined) {
  const formatted = (addresses ?? [])
    .map(formatAddress)
    .filter(Boolean)
    .join(", ");

  return formatted || null;
}

function parseEmail(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? null;
}
