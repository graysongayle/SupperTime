import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  classifyRecord,
  defaultSkipDomains,
  formatAddress,
  formatEmailList,
  getAttachments,
  getNotes,
  getRequesterEmail,
  isPublicAgentReply,
  mapPriority,
  mapStatus,
  parseArgs,
  parseDate,
  readFreshdeskRecords,
  stripHtml,
  summarizeClassifications,
} from "./lib/freshdesk-import-utils.mjs";

const args = parseArgs(process.argv.slice(2));

loadDotEnv();

const zipPath = String(args.zip ?? "imports/2303908.zip");
const reportsDir = String(args["reports-dir"] ?? "imports/reports");
const write = Boolean(args.write);
const fullImport = Boolean(args["confirm-full-import"]);
const includeReview = args["include-review"] !== "false";
const limit = args.limit === undefined ? 50 : Number(args.limit);
const skipDomains = parseDomainList(args["skip-domains"]) ?? defaultSkipDomains;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportBase = path.join(reportsDir, `freshdesk-import-${timestamp}`);
let emailSendCount = 0;

process.env.SUPPRESS_OUTBOUND_EMAIL_DURING_IMPORT = "1";

if (!Number.isFinite(limit) || limit < 0) {
  console.error("--limit must be a non-negative number.");
  process.exit(1);
}

if (write && limit === 0 && !fullImport) {
  console.error("Full write imports require --confirm-full-import.");
  process.exit(1);
}

if (write && !process.env.DATABASE_URL) {
  console.error("Missing required env: DATABASE_URL");
  process.exit(1);
}

mkdirSync(reportsDir, { recursive: true });

const records = readFreshdeskRecords(zipPath).map((record) => ({
  ...record,
  classification: classifyRecord(record, {
    skipDomains,
  }),
}));
const classifications = records.map((record) => record.classification);
const selected = selectRecords(records, {
  includeReview,
  limit,
});
const dryRunSummary = buildDryRunSummary(records, selected, includeReview);

writeFileSync(
  `${reportBase}.dry-run.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      includeReview,
      limit,
      mode: write ? "write" : "dry-run",
      selectedTickets: selected.map((record) => record.classification),
      skipDomains,
      sourceZip: zipPath,
      summary: dryRunSummary,
    },
    null,
    2,
  ),
);

console.log(`Freshdesk import ${write ? "write" : "dry-run"} plan`);
console.log(`Source tickets: ${records.length}`);
console.log(`Decision counts: ${JSON.stringify(summarizeClassifications(classifications).byDecision)}`);
console.log(`Selected for ${write ? "write" : "import"}: ${selected.length}`);
console.log(`Dry-run report: ${reportBase}.dry-run.json`);

if (!write) {
  console.log("No database writes performed. Pass --write to import the selected tickets.");
  console.log(`Outbound email suppressed. emailSendCount=${emailSendCount}`);
  process.exit(0);
}

const { default: pg } = await import("pg");
const { Pool } = pg;
const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
});

let importRunId = null;

try {
  await pool.query("begin");

  importRunId = randomUUID();

  await pool.query(
    `
      insert into "FreshdeskImport" (
        "id", "sourceFile", "importedBy", "startedAt", "totalRows",
        "importedRows", "failedRows", "errorSummary"
      )
      values ($1, $2, $3, now(), $4, 0, 0, $5::jsonb)
    `,
    [
      importRunId,
      zipPath,
      "scripts/freshdesk-import.mjs",
      records.length,
      JSON.stringify({
        dryRunReport: `${reportBase}.dry-run.json`,
        emailSuppression: "enabled",
        includeReview,
        selectedRows: selected.length,
      }),
    ],
  );

  let importedRows = 0;
  let duplicateRows = 0;

  for (const input of selected) {
    const existing = await pool.query(
      'select "id" from "Ticket" where "freshdeskTicketId" = $1 limit 1',
      [String(input.record.id)],
    );

    if (existing.rows.length > 0) {
      duplicateRows += 1;
      continue;
    }

    await importTicket(pool, input, importRunId);
    importedRows += 1;
  }

  await pool.query(
    `
      update "FreshdeskImport"
      set
        "completedAt" = now(),
        "importedRows" = $2,
        "failedRows" = 0,
        "errorSummary" = $3::jsonb
      where "id" = $1
    `,
    [
      importRunId,
      importedRows,
      JSON.stringify({
        duplicateRows,
        dryRunReport: `${reportBase}.dry-run.json`,
        emailSendCount,
        emailSuppression: "enabled",
        selectedRows: selected.length,
      }),
    ],
  );

  await pool.query("commit");

  writeFileSync(
    `${reportBase}.result.json`,
    JSON.stringify(
      {
        duplicateRows,
        emailSendCount,
        importRunId,
        importedRows,
        selectedRows: selected.length,
      },
      null,
      2,
    ),
  );

  console.log(`Import run: ${importRunId}`);
  console.log(`Imported tickets: ${importedRows}`);
  console.log(`Skipped duplicates: ${duplicateRows}`);
  console.log(`Result report: ${reportBase}.result.json`);
  console.log(`Outbound email suppressed. emailSendCount=${emailSendCount}`);
} catch (error) {
  await pool.query("rollback").catch(() => {});
  throw error;
} finally {
  await pool.end();
}

async function importTicket(pool, input, importRunId) {
  const record = input.record;
  const classification = input.classification;
  const requesterEmail = getRequesterEmail(record);
  const requesterName = record.requester?.name ?? record.requester_name ?? null;
  const customerId = await upsertCustomer(pool, {
    email: requesterEmail,
    name: requesterName,
    phone: record.requester?.phone ?? null,
  });
  const ticketId = randomUUID();
  const createdAt = parseDate(record.created_at) ?? new Date();
  const updatedAt = parseDate(record.updated_at) ?? createdAt;
  const ticketStates = record.ticket_states ?? {};
  const status = mapStatus(record.status_name);
  const resolvedAt =
    parseDate(ticketStates.resolved_at) ??
    (status === "RESOLVED" || status === "CLOSED" ? updatedAt : null);
  const closedAt = parseDate(ticketStates.closed_at) ?? (status === "CLOSED" ? updatedAt : null);
  const description = getTicketPlainBody(record) || null;

  await pool.query(
    `
      insert into "Ticket" (
        "id", "subject", "description", "status", "priority", "source",
        "externalId", "freshdeskTicketId", "freshdeskImportedAt",
        "createdAt", "updatedAt", "resolvedAt", "closedAt",
        "customerId", "assignedToId", "freshdeskImportId"
      )
      values (
        $1, $2, $3, $4::"TicketStatus", $5::"TicketPriority",
        'FRESHDESK_IMPORT'::"TicketSource", $6, $7, now(),
        $8, $9, $10, $11, $12, null, $13
      )
    `,
    [
      ticketId,
      getTicketSubject(record),
      description,
      status,
      mapPriority(record.priority_name),
      `freshdesk-display:${record.display_id}`,
      String(record.id),
      createdAt,
      updatedAt,
      resolvedAt,
      closedAt,
      customerId,
      importRunId,
    ],
  );

  await pool.query(
    `
      insert into "TicketParticipant" (
        "id", "role", "email", "name", "createdAt", "updatedAt",
        "ticketId", "customerId"
      )
      values ($1, 'REQUESTER'::"TicketParticipantRole", $2, $3, $4, $4, $5, $6)
      on conflict ("ticketId", "email") do update set
        "role" = 'REQUESTER'::"TicketParticipantRole",
        "customerId" = excluded."customerId",
        "updatedAt" = excluded."updatedAt"
    `,
    [randomUUID(), requesterEmail, requesterName, createdAt, ticketId, customerId],
  );

  await pool.query(
    `
      insert into "TicketStatusHistory" (
        "id", "from", "to", "note", "createdAt", "ticketId", "changedById"
      )
      values ($1, null, $2::"TicketStatus", $3, $4, $5, null)
    `,
    [
      randomUUID(),
      status,
      `Imported from Freshdesk ticket ${record.display_id ?? record.id}.`,
      createdAt,
      ticketId,
    ],
  );

  await importInitialMessage(pool, {
    customerId,
    record,
    requesterEmail,
    requesterName,
    ticketId,
  });

  for (const note of getNotes(record).filter((note) => !note.deleted).sort(compareCreatedAt)) {
    await importNote(pool, {
      customerId,
      note,
      requesterEmail,
      requesterName,
      ticketId,
    });
  }

  const attachments = getAttachments(record);

  if (attachments.length > 0) {
    await pool.query(
      `
        insert into "TicketMessage" (
          "id", "body", "authorType", "visibility", "createdAt", "ticketId"
        )
        values ($1, $2, 'SYSTEM'::"MessageAuthorType", 'INTERNAL'::"MessageVisibility", $3, $4)
      `,
      [
        randomUUID(),
        buildAttachmentMetadataNote(attachments, classification),
        updatedAt,
        ticketId,
      ],
    );
  }
}

async function upsertCustomer(pool, customer) {
  const result = await pool.query(
    `
      insert into "Customer" ("id", "email", "name", "phone", "createdAt", "updatedAt")
      values ($1, $2, $3, $4, now(), now())
      on conflict ("email") do update set
        "name" = case
          when "Customer"."name" is null or "Customer"."name" = ''
          then excluded."name"
          else "Customer"."name"
        end,
        "phone" = case
          when "Customer"."phone" is null or "Customer"."phone" = ''
          then excluded."phone"
          else "Customer"."phone"
        end,
        "updatedAt" = now()
      returning "id"
    `,
    [randomUUID(), customer.email, customer.name, customer.phone],
  );

  return result.rows[0].id;
}

async function importInitialMessage(pool, input) {
  const body = getTicketPlainBody(input.record);
  const bodyHtml = input.record.description_html ?? null;

  if (!body && !bodyHtml) {
    return;
  }

  await pool.query(
    `
      insert into "TicketMessage" (
        "id", "body", "bodyHtml", "authorType", "visibility",
        "emailFrom", "emailTo", "emailCc", "createdAt", "ticketId", "customerId"
      )
      values (
        $1, $2, $3, 'CUSTOMER'::"MessageAuthorType", 'PUBLIC'::"MessageVisibility",
        $4, $5, $6, $7, $8, $9
      )
    `,
    [
      randomUUID(),
      body || stripHtml(bodyHtml) || "No message body provided.",
      bodyHtml,
      formatAddress(input.requesterName, input.requesterEmail),
      formatEmailList(input.record.to_emails ?? input.record.to_email),
      formatEmailList(input.record.cc_email?.cc_emails),
      parseDate(input.record.created_at) ?? new Date(),
      input.ticketId,
      input.customerId,
    ],
  );
}

async function importNote(pool, input) {
  const body = String(input.note.body ?? "").trim() || stripHtml(input.note.body_html);
  const incoming = input.note.incoming === true;
  const privateNote = input.note.private === true;
  const authorType = incoming ? "CUSTOMER" : "AGENT";
  const visibility = privateNote ? "INTERNAL" : "PUBLIC";

  await pool.query(
    `
      insert into "TicketMessage" (
        "id", "body", "bodyHtml", "authorType", "visibility",
        "emailFrom", "emailTo", "createdAt", "ticketId", "customerId", "agentId"
      )
      values (
        $1, $2, $3, $4::"MessageAuthorType", $5::"MessageVisibility",
        $6, $7, $8, $9, $10, null
      )
    `,
    [
      randomUUID(),
      body || "No message body provided.",
      input.note.body_html ?? null,
      authorType,
      visibility,
      incoming ? formatAddress(input.requesterName, input.requesterEmail) : input.note.support_email,
      incoming ? input.note.support_email : input.requesterEmail,
      parseDate(input.note.created_at) ?? new Date(),
      input.ticketId,
      incoming ? input.customerId : null,
    ],
  );
}

function selectRecords(records, options) {
  const eligible = records.filter((record) => {
    if (record.classification.decision === "import") {
      return true;
    }

    return options.includeReview && record.classification.decision === "review";
  });

  if (options.limit === 0) {
    return eligible;
  }

  const selected = [];
  const selectedIds = new Set();
  const addWhere = (count, predicate) => {
    for (const record of eligible) {
      if (selected.length >= options.limit || count <= 0) {
        return;
      }

      const id = record.classification.freshdeskId;

      if (selectedIds.has(id) || !predicate(record)) {
        continue;
      }

      selected.push(record);
      selectedIds.add(id);
      count -= 1;
    }
  };

  addWhere(10, (record) => record.classification.publicAgentReplyCount > 0);
  addWhere(5, (record) => record.classification.tagCount > 0);
  addWhere(3, (record) => record.classification.attachmentMetadataCount > 0);
  addWhere(3, (record) => ["Open", "Pending"].includes(record.classification.status));
  addWhere(5, (record) => record.classification.decision === "review");
  addWhere(options.limit, () => true);

  return selected.slice(0, options.limit);
}

function buildDryRunSummary(records, selected, includeReview) {
  const selectedClassifications = selected.map((record) => record.classification);

  return {
    allTickets: summarizeClassifications(records.map((record) => record.classification)),
    emailSendCount,
    emailSuppression: "enabled",
    includeReview,
    selectedTickets: summarizeClassifications(selectedClassifications),
  };
}

function getTicketSubject(record) {
  const subject = String(record.subject ?? "").trim();
  return subject || `Freshdesk ticket ${record.display_id ?? record.id}`;
}

function getTicketPlainBody(record) {
  return String(record.description ?? "").trim() || stripHtml(record.description_html);
}

function compareCreatedAt(left, right) {
  const leftDate = parseDate(left.created_at)?.getTime() ?? 0;
  const rightDate = parseDate(right.created_at)?.getTime() ?? 0;
  return leftDate - rightDate;
}

function buildAttachmentMetadataNote(attachments, classification) {
  const lines = [
    `Freshdesk import found ${attachments.length} attachment metadata record${
      attachments.length === 1 ? "" : "s"
    }. Files were not downloaded during import.`,
    "",
    `Freshdesk ticket: ${classification.displayId ?? classification.freshdeskId}`,
  ];

  for (const attachment of attachments) {
    const name = attachment.content_file_name ?? "unnamed attachment";
    const type = attachment.content_content_type ?? "unknown type";
    const size = attachment.content_file_size ?? "unknown size";
    const id = attachment.id ?? "unknown id";
    const url = attachment.attachment_url_for_export ?? attachment.attachment_url;
    lines.push(`- ${name} (${type}, ${size} bytes, Freshdesk attachment ${id})`);

    if (url) {
      lines.push(`  URL: ${url}`);
    }
  }

  return lines.join("\n");
}

function parseDomainList(value) {
  if (!value || value === true) {
    return null;
  }

  return String(value)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
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
