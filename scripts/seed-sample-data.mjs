import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

loadDotEnv();

if (!process.env.DATABASE_URL) {
  console.error("Missing required env: DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
});

try {
  const agent = await pool.query(
    `
      select "id"
      from "User"
      where "isActive" = true and "role" in ('SUPER_ADMIN', 'MANAGER', 'AGENT')
      order by
        case "role"
          when 'SUPER_ADMIN' then 1
          when 'MANAGER' then 2
          else 3
        end,
        "createdAt" asc
      limit 1
    `
  );
  const assignedToId = agent.rows[0]?.id ?? null;

  await pool.query("begin");

  await upsertCustomers();
  await upsertTags();
  await upsertTickets(assignedToId);
  await upsertMessages(assignedToId);
  await upsertAttachments();
  await upsertTicketTags();
  await upsertStatusHistory(assignedToId);

  await pool.query("commit");
  console.log("Seeded sample support data.");
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}

async function upsertCustomers() {
  await pool.query(
    `
      insert into "Customer" ("id", "email", "name", "createdAt", "updatedAt")
      values
        ('sample_customer_nora', 'nora.allen@example.com', 'Nora Allen', now(), now()),
        ('sample_customer_ridgeway', 'ops@ridgewaylabs.example', 'Ridgeway Labs', now(), now()),
        ('sample_customer_elena', 'elena.cruz@example.com', 'Elena Cruz', now(), now()),
        ('sample_customer_northstar', 'support@northstarapps.example', 'Northstar Apps', now(), now()),
        ('sample_customer_ledger', 'admin@ledgerpeak.example', 'LedgerPeak Finance', now(), now())
      on conflict ("id") do update set
        "email" = excluded."email",
        "name" = excluded."name",
        "updatedAt" = now()
    `
  );
}

async function upsertTags() {
  await pool.query(
    `
      insert into "Tag" ("id", "name", "color", "createdAt")
      values
        ('sample_tag_billing', 'billing', '#4f46e5', now()),
        ('sample_tag_api', 'api', '#0891b2', now()),
        ('sample_tag_import', 'import', '#ca8a04', now()),
        ('sample_tag_embed', 'embedded-form', '#059669', now())
      on conflict ("id") do update set
        "name" = excluded."name",
        "color" = excluded."color"
    `
  );
}

async function upsertTickets(assignedToId) {
  await pool.query(
    `
      insert into "Ticket" (
        "id", "subject", "description", "status", "priority", "source",
        "externalId", "emailThreadId", "customerId", "assignedToId",
        "createdAt", "updatedAt", "resolvedAt", "closedAt"
      )
      values
        (
          'sample_ticket_billing_admin',
          'Cannot invite new billing admin',
          'Customer sees a permissions error when inviting a second billing admin.',
          'OPEN',
          'URGENT',
          'EMAIL',
          'sample-1001',
          'thread-sample-1001',
          'sample_customer_nora',
          $1,
          now() - interval '3 hours',
          now() - interval '12 minutes',
          null,
          null
        ),
        (
          'sample_ticket_webhook_retries',
          'Webhook retries after endpoint recovery',
          'Customer wants to understand retry behavior after their endpoint recovered.',
          'WAITING_ON_CUSTOMER',
          'HIGH',
          'EMAIL',
          'sample-1002',
          'thread-sample-1002',
          'sample_customer_ridgeway',
          $1,
          now() - interval '7 hours',
          now() - interval '31 minutes',
          null,
          null
        ),
        (
          'sample_ticket_csv_dates',
          'CSV import date format mismatch',
          'Imported CSV dates are being interpreted as US format instead of ISO.',
          'PENDING',
          'NORMAL',
          'MANUAL',
          'sample-1003',
          null,
          'sample_customer_elena',
          $1,
          now() - interval '1 day',
          now() - interval '1 hour',
          null,
          null
        ),
        (
          'sample_ticket_embed_styling',
          'Embedded support form styling question',
          'Customer asked whether the embedded iframe can inherit their product theme.',
          'RESOLVED',
          'LOW',
          'EMBEDDED_FORM',
          'sample-1004',
          null,
          'sample_customer_northstar',
          $1,
          now() - interval '2 days',
          now() - interval '3 hours',
          now() - interval '3 hours',
          null
        ),
        (
          'sample_ticket_login_loop',
          'User login loops after password reset',
          'Customer reports being redirected back to login after completing password reset.',
          'OPEN',
          'HIGH',
          'EMAIL',
          'sample-1005',
          'thread-sample-1005',
          'sample_customer_ledger',
          null,
          now() - interval '45 minutes',
          now() - interval '18 minutes',
          null,
          null
        )
      on conflict ("id") do update set
        "subject" = excluded."subject",
        "description" = excluded."description",
        "status" = excluded."status",
        "priority" = excluded."priority",
        "source" = excluded."source",
        "externalId" = excluded."externalId",
        "emailThreadId" = excluded."emailThreadId",
        "customerId" = excluded."customerId",
        "assignedToId" = excluded."assignedToId",
        "updatedAt" = excluded."updatedAt",
        "resolvedAt" = excluded."resolvedAt",
        "closedAt" = excluded."closedAt"
    `,
    [assignedToId]
  );
}

async function upsertMessages(assignedToId) {
  await pool.query(
    `
      insert into "TicketMessage" (
        "id", "body", "authorType", "visibility", "emailMessageId",
        "ticketId", "customerId", "agentId", "createdAt"
      )
      values
        ('sample_msg_billing_1', 'I cannot invite our finance lead as a billing admin.', 'CUSTOMER', 'PUBLIC', 'sample-msg-1001-a', 'sample_ticket_billing_admin', 'sample_customer_nora', null, now() - interval '3 hours'),
        ('sample_msg_billing_2', 'We are checking the organization permission state now.', 'AGENT', 'PUBLIC', null, 'sample_ticket_billing_admin', null, $1, now() - interval '20 minutes'),
        ('sample_msg_webhook_1', 'Can you confirm whether retries continue after our endpoint returns 200 again?', 'CUSTOMER', 'PUBLIC', 'sample-msg-1002-a', 'sample_ticket_webhook_retries', 'sample_customer_ridgeway', null, now() - interval '7 hours'),
        ('sample_msg_csv_1', 'The attached CSV imports March 4 as April 3.', 'CUSTOMER', 'PUBLIC', 'sample-msg-1003-a', 'sample_ticket_csv_dates', 'sample_customer_elena', null, now() - interval '1 day'),
        ('sample_msg_embed_1', 'Can the support form match our app theme?', 'CUSTOMER', 'PUBLIC', null, 'sample_ticket_embed_styling', 'sample_customer_northstar', null, now() - interval '2 days'),
        ('sample_msg_login_1', 'Several users are stuck in a login loop after password reset.', 'CUSTOMER', 'PUBLIC', 'sample-msg-1005-a', 'sample_ticket_login_loop', 'sample_customer_ledger', null, now() - interval '45 minutes')
      on conflict ("id") do update set
        "body" = excluded."body",
        "authorType" = excluded."authorType",
        "visibility" = excluded."visibility",
        "emailMessageId" = excluded."emailMessageId",
        "ticketId" = excluded."ticketId",
        "customerId" = excluded."customerId",
        "agentId" = excluded."agentId",
        "createdAt" = excluded."createdAt"
    `,
    [assignedToId]
  );
}

async function upsertAttachments() {
  await pool.query(
    `
      insert into "Attachment" (
        "id", "fileName", "contentType", "sizeBytes", "storageKey", "ticketId", "messageId", "createdAt"
      )
      values
        ('sample_attachment_billing_error', 'billing-admin-error.png', 'image/png', 183240, 'sample/billing-admin-error.png', 'sample_ticket_billing_admin', 'sample_msg_billing_1', now() - interval '3 hours'),
        ('sample_attachment_csv_import', 'freshdesk-export-sample.csv', 'text/csv', 48291, 'sample/freshdesk-export-sample.csv', 'sample_ticket_csv_dates', 'sample_msg_csv_1', now() - interval '1 day'),
        ('sample_attachment_login_har', 'login-loop.har', 'application/json', 92210, 'sample/login-loop.har', 'sample_ticket_login_loop', 'sample_msg_login_1', now() - interval '44 minutes')
      on conflict ("id") do update set
        "fileName" = excluded."fileName",
        "contentType" = excluded."contentType",
        "sizeBytes" = excluded."sizeBytes",
        "storageKey" = excluded."storageKey",
        "ticketId" = excluded."ticketId",
        "messageId" = excluded."messageId"
    `
  );
}

async function upsertTicketTags() {
  await pool.query(
    `
      insert into "TicketTag" ("ticketId", "tagId")
      values
        ('sample_ticket_billing_admin', 'sample_tag_billing'),
        ('sample_ticket_webhook_retries', 'sample_tag_api'),
        ('sample_ticket_csv_dates', 'sample_tag_import'),
        ('sample_ticket_embed_styling', 'sample_tag_embed'),
        ('sample_ticket_login_loop', 'sample_tag_billing')
      on conflict ("ticketId", "tagId") do nothing
    `
  );
}

async function upsertStatusHistory(assignedToId) {
  await pool.query(
    `
      insert into "TicketStatusHistory" ("id", "from", "to", "note", "ticketId", "changedById", "createdAt")
      values
        ('sample_status_billing_open', null, 'OPEN', 'Sample ticket created from inbound email.', 'sample_ticket_billing_admin', $1, now() - interval '3 hours'),
        ('sample_status_webhook_waiting', 'OPEN', 'WAITING_ON_CUSTOMER', 'Waiting for customer endpoint logs.', 'sample_ticket_webhook_retries', $1, now() - interval '31 minutes'),
        ('sample_status_csv_pending', 'OPEN', 'PENDING', 'Queued for import parser review.', 'sample_ticket_csv_dates', $1, now() - interval '1 hour'),
        ('sample_status_embed_resolved', 'OPEN', 'RESOLVED', 'Explained iframe styling constraints.', 'sample_ticket_embed_styling', $1, now() - interval '3 hours')
      on conflict ("id") do update set
        "from" = excluded."from",
        "to" = excluded."to",
        "note" = excluded."note",
        "ticketId" = excluded."ticketId",
        "changedById" = excluded."changedById",
        "createdAt" = excluded."createdAt"
    `,
    [assignedToId]
  );
}

function normalizeDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

function loadDotEnv() {
  let contents;

  try {
    contents = readFileSync(".env", "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}
