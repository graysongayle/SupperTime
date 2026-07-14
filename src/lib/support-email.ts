import { randomBytes } from "node:crypto";

type PostmarkHeader = {
  Name: string;
  Value: string;
};

type PostmarkAttachment = {
  Content: string;
  ContentType: string;
  Name: string;
};

const automatedReplyHeaders: PostmarkHeader[] = [
  {
    Name: "Auto-Submitted",
    Value: "auto-replied",
  },
  {
    Name: "X-Auto-Response-Suppress",
    Value: "All",
  },
];

type SendSupportEmailInput = {
  attachments?: PostmarkAttachment[];
  cc?: string | null;
  htmlBody?: string | null;
  messageStream?: string | null;
  metadata?: Record<string, string>;
  replyTo?: string | null;
  subject: string;
  textBody: string;
  to: string;
  headers?: PostmarkHeader[];
};

export type SupportEmailResult =
  | {
      messageId: string | null;
      skipped: false;
    }
  | {
      reason: string;
      skipped: true;
    };

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupportSender() {
  const email = requiredEnv("SUPPORT_FROM_EMAIL");
  const name = requiredEnv("SUPPORT_FROM_NAME");

  return {
    email,
    formatted: `${name} <${email}>`,
    name,
  };
}

export function isSupportEmailAddress(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();

  if (!email) {
    return false;
  }

  const supportEmail = process.env.SUPPORT_FROM_EMAIL?.trim().toLowerCase();

  if (!supportEmail) {
    return false;
  }

  if (email === supportEmail) {
    return true;
  }

  const [supportLocalPart, supportDomain] = supportEmail.split("@");
  const [localPart, domain] = email.split("@");

  return Boolean(
    supportLocalPart &&
      supportDomain &&
      localPart &&
      domain &&
      domain === supportDomain &&
      localPart.startsWith(`${supportLocalPart}+`),
  );
}

export function getPostmarkInboundWebhookSecret() {
  return requiredEnv("POSTMARK_INBOUND_WEBHOOK_SECRET");
}

export function isSupportAutoReplyEnabled() {
  return process.env.SUPPORT_AUTO_REPLY_ENABLED?.trim().toLowerCase() !== "false";
}

export function getAutomatedReplyHeaders() {
  return automatedReplyHeaders;
}

export function getSupportAppBaseUrl() {
  const value =
    process.env.SUPPORT_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: SUPPORT_APP_BASE_URL");
  }

  return value.replace(/\/+$/, "");
}

export function buildTicketUrl(ticketId: string) {
  return `${getSupportAppBaseUrl()}/tickets/${ticketId}`;
}

export function createEmailReplyToken() {
  return randomBytes(18).toString("base64url");
}

export function buildTicketReplyAddress(ticketId: string, token: string) {
  const sender = getSupportSender();
  const [localPart, domain] = sender.email.split("@");

  if (!localPart || !domain) {
    return sender.email;
  }

  return `${localPart}+ticket_${ticketId}_${token}@${domain}`;
}

export function extractTicketReplyToken(value: string) {
  const match = value.match(
    /[A-Z0-9._%+-]+\+ticket_([^_\s@<>]+)_([^@\s<>]+)@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );

  if (!match) {
    return null;
  }

  return {
    ticketId: match[1],
    token: match[2],
  };
}

function renderTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function normalizeMessageId(value: string | null | undefined) {
  return value?.trim().replace(/^<|>$/g, "") || null;
}

export function messageIdVariants(value: string | null | undefined) {
  const normalized = normalizeMessageId(value);

  if (!normalized) {
    return [];
  }

  return [normalized, `<${normalized}>`];
}

export function textToHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function buildCustomerConfirmationSubject(ticketNumber: number) {
  const template =
    process.env.SUPPORT_CUSTOMER_CONFIRMATION_SUBJECT?.trim() ||
    "We received your support request #{ticketNumber}";

  return renderTemplate(template, {
    ticketNumber,
  });
}

export async function sendSupportEmail({
  attachments,
  cc,
  headers,
  htmlBody,
  messageStream,
  metadata,
  replyTo,
  subject,
  textBody,
  to,
}: SendSupportEmailInput): Promise<SupportEmailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();

  if (!token) {
    return {
      reason: "POSTMARK_SERVER_TOKEN is not configured.",
      skipped: true,
    };
  }

  const resolvedMessageStream =
    (messageStream ?? process.env.POSTMARK_MESSAGE_STREAM?.trim()) || undefined;

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: getSupportSender().formatted,
      Attachments: attachments && attachments.length > 0 ? attachments : undefined,
      Cc: cc || undefined,
      Headers: headers,
      HtmlBody: htmlBody ?? textToHtml(textBody),
      MessageStream: resolvedMessageStream,
      Metadata: metadata,
      ReplyTo: replyTo ?? getSupportSender().email,
      Subject: subject,
      TextBody: textBody,
      To: to,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    ErrorCode?: number;
    Message?: string;
    MessageID?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      payload?.Message ?? `Postmark send failed with ${response.status}.`,
    );
  }

  return {
    messageId: payload?.MessageID ?? null,
    skipped: false,
  };
}

export function buildCustomerConfirmationText(
  ticketNumber: number,
  ticketSubject: string,
) {
  const template =
    process.env.SUPPORT_CUSTOMER_CONFIRMATION_TEXT?.trim() ||
    [
      "Thanks for contacting PsychData Support.",
      "",
      `We received your request and created ticket #${ticketNumber}.`,
      `Subject: ${ticketSubject}`,
      "",
      "A support team member will review it and reply as soon as possible.",
    ].join("\n");

  return renderTemplate(template, {
    supportName: getSupportSender().name,
    ticketNumber,
    ticketSubject,
  });
}
