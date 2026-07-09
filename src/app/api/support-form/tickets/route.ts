import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import {
  MessageAuthorType,
  MessageVisibility,
  TicketParticipantRole,
  TicketSource,
  TicketStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerConfirmationText,
  buildTicketReplyAddress,
  createEmailReplyToken,
  getAutomatedReplyHeaders,
  isSupportAutoReplyEnabled,
  sendSupportEmail,
} from "@/lib/support-email";
import {
  isSupportFormOriginAllowed,
  supportFormCorsHeaders,
} from "@/lib/support-form";

export const dynamic = "force-dynamic";

type SupportFormPayload = {
  captchaToken?: unknown;
  company?: unknown;
  email?: unknown;
  formId?: unknown;
  message?: unknown;
  name?: unknown;
  pageUrl?: unknown;
  phone?: unknown;
  subject?: unknown;
};

type CaptchaVerificationResult =
  | {
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function jsonResponse(
  origin: string | null,
  body: Record<string, unknown>,
  init?: ResponseInit,
) {
  const headers = supportFormCorsHeaders(origin);
  headers.set("Content-Type", "application/json");

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isSupportFormOriginAllowed(origin)) {
    return jsonResponse(
      origin,
      { error: "This origin is not allowed to submit support forms." },
      { status: 403 },
    );
  }

  return new Response(null, {
    headers: supportFormCorsHeaders(origin),
    status: 204,
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isSupportFormOriginAllowed(origin)) {
    return jsonResponse(
      origin,
      { error: "This origin is not allowed to submit support forms." },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | SupportFormPayload
    | null;

  if (!payload) {
    return jsonResponse(
      origin,
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  if (normalizeString(payload.company, 200)) {
    return jsonResponse(origin, { ok: true });
  }

  const email = normalizeString(payload.email, 254)?.toLowerCase();
  const formId = normalizeString(payload.formId, 128);
  const message = normalizeString(payload.message, 10000);
  const name = normalizeString(payload.name, 160);
  const pageUrl = normalizeString(payload.pageUrl, 1000);
  const phone = normalizeString(payload.phone, 80);
  const subject = normalizeString(payload.subject, 200) ?? "Support request";
  const captchaToken = normalizeString(payload.captchaToken, 2048);

  if (!email || !emailPattern.test(email)) {
    return jsonResponse(
      origin,
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }

  if (!message) {
    return jsonResponse(
      origin,
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const supportForm = formId
    ? await prisma.supportForm.findUnique({
        where: {
          id: formId,
        },
        select: {
          id: true,
          isActive: true,
          name: true,
          turnstileEnabled: true,
        },
      })
    : null;

  if (!supportForm || !supportForm.isActive) {
    return jsonResponse(
      origin,
      { error: "Support form is not available." },
      { status: 404 },
    );
  }

  const captchaResult = supportForm.turnstileEnabled
    ? await verifyTurnstileToken(captchaToken, request)
    : { ok: true as const };

  if (!captchaResult.ok) {
    return jsonResponse(origin, { error: captchaResult.error }, { status: 400 });
  }

  const emailReplyToken = createEmailReplyToken();
  const body = [
    message,
    phone ? `\n\nPhone: ${phone}` : null,
    pageUrl ? `\n\nSubmitted from: ${pageUrl}` : null,
  ]
    .filter(Boolean)
    .join("");
  const messageCreatedAt = new Date();

  const ticket = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: {
        email,
      },
      create: {
        email,
        name,
        phone,
      },
      update: {
        name: name ?? undefined,
        phone: phone ?? undefined,
      },
    });

    return tx.ticket.create({
      data: {
        customerId: customer.id,
        description: body,
        emailReplyToken,
        externalId: `support-form:${supportForm.id}:${crypto.randomUUID()}`,
        source: TicketSource.EMBEDDED_FORM,
        supportFormId: supportForm.id,
        subject,
        lastCustomerMessageAt: messageCreatedAt,
        messages: {
          create: {
            authorType: MessageAuthorType.CUSTOMER,
            body,
            createdAt: messageCreatedAt,
            customerId: customer.id,
            emailFrom: name ? `${name} <${email}>` : email,
            visibility: MessageVisibility.PUBLIC,
          },
        },
        participants: {
          create: {
            customerId: customer.id,
            email,
            name,
            role: TicketParticipantRole.REQUESTER,
          },
        },
        statusHistory: {
          create: {
            note: pageUrl
              ? `Ticket created from embedded support form "${supportForm.name}" on ${pageUrl}.`
              : `Ticket created from embedded support form "${supportForm.name}".`,
            to: TicketStatus.OPEN,
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
  });

  await sendEmbeddedFormConfirmation({
    customerEmail: ticket.customer.email,
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    ticketSubject: ticket.subject,
    token: ticket.emailReplyToken ?? emailReplyToken,
  });

  revalidatePath("/tickets");
  revalidatePath("/customers");
  revalidatePath("/support-forms");

  return jsonResponse(origin, {
    ok: true,
    ticketNumber: ticket.number,
  });
}

async function verifyTurnstileToken(
  token: string | null,
  request: NextRequest,
): Promise<CaptchaVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    return {
      error: "CAPTCHA verification is not configured.",
      ok: false,
    };
  }

  if (!token) {
    return {
      error: "CAPTCHA verification is required.",
      ok: false,
    };
  }

  const remoteIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    undefined;

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      body: JSON.stringify({
        remoteip: remoteIp,
        response: token,
        secret,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
  } | null;

  if (!response.ok || !payload?.success) {
    return {
      error: "CAPTCHA verification failed. Please try again.",
      ok: false,
    };
  }

  return { ok: true };
}

async function sendEmbeddedFormConfirmation({
  customerEmail,
  ticketId,
  ticketNumber,
  ticketSubject,
  token,
}: {
  customerEmail: string;
  ticketId: string;
  ticketNumber: number;
  ticketSubject: string;
  token: string;
}) {
  if (!isSupportAutoReplyEnabled()) {
    await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorType: MessageAuthorType.SYSTEM,
        body: "Customer confirmation auto-reply skipped because SUPPORT_AUTO_REPLY_ENABLED=false.",
        visibility: MessageVisibility.INTERNAL,
      },
    });
    return;
  }

  try {
    const result = await sendSupportEmail({
      metadata: {
        source: "embedded-support-form",
        ticketId,
        ticketNumber: String(ticketNumber),
      },
      headers: getAutomatedReplyHeaders(),
      replyTo: buildTicketReplyAddress(ticketId, token),
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
        authorType: MessageAuthorType.SYSTEM,
        body: `Customer confirmation email failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        visibility: MessageVisibility.INTERNAL,
      },
    });
  }
}
