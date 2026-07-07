import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

export const defaultSkipDomains = [];

export const vendorSkipDomains = [
  "godaddy.com",
  "e.godaddy.com",
  "registry.godaddy",
  "google.com",
  "accounts.google.com",
  "digicert.com",
  "sherweb.com",
  "wordpress.com",
  "dashlane.com",
  "qualys.net",
  "mail.instagram.com",
];

export function parseArgs(argv) {
  const args = {
    _: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex);

    if (equalsIndex !== -1) {
      args[key] = arg.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

export function readFreshdeskRecords(zipPath) {
  const zip = new ZipReader(zipPath);
  const records = [];

  for (const entry of zip.entries()) {
    if (!entry.fileName.endsWith(".json")) {
      continue;
    }

    const raw = zip.readEntry(entry);
    const parsed = JSON.parse(raw.toString("utf8"));

    if (!Array.isArray(parsed)) {
      continue;
    }

    for (const item of parsed) {
      const record = item.helpdesk_ticket ?? item.helpdesk_archive_ticket;
      const wrapper = item.helpdesk_ticket ? "helpdesk_ticket" : "helpdesk_archive_ticket";

      if (!record) {
        continue;
      }

      records.push({
        fileName: entry.fileName,
        record,
        wrapper,
      });
    }
  }

  return records;
}

export function classifyRecord(input, options = {}) {
  const record = input.record;
  const skipDomains = new Set(
    (options.skipDomains ?? defaultSkipDomains).map((domain) => domain.toLowerCase()),
  );
  const notes = getNotes(record);
  const publicAgentReplyCount = notes.filter(isPublicAgentReply).length;
  const internalNoteCount = notes.filter((note) => note.private === true && !note.deleted).length;
  const incomingCustomerNoteCount = notes.filter(
    (note) => note.incoming === true && !note.deleted,
  ).length;
  const tagNames = getTagNames(record);
  const attachmentMetadataCount = getAttachments(record).length;
  const requesterEmail = getRequesterEmail(record);
  const requesterDomain = getEmailDomain(requesterEmail);
  const status = record.status_name ?? "";
  const priority = record.priority_name ?? "";
  const reasons = [];

  let decision = "review";

  if (input.wrapper === "helpdesk_archive_ticket") {
    reasons.push("archived_ticket_skipped_first_pass");
    decision = "skip";
  }

  if (!requesterEmail) {
    reasons.push("missing_requester_email");
    decision = "skip";
  }

  const closedOrResolved = status === "Closed" || status === "Resolved";
  const lowPriority = priority === "Low";
  const noPublicAgentReply = publicAgentReplyCount === 0;
  const noTags = tagNames.length === 0;
  const noAttachments = attachmentMetadataCount === 0;

  if (
    decision !== "skip" &&
    closedOrResolved &&
    lowPriority &&
    noPublicAgentReply &&
    noTags &&
    noAttachments
  ) {
    reasons.push("closed_or_resolved_low_no_public_reply_no_tags_no_attachments");
    decision = "skip";
  }

  if (
    decision !== "skip" &&
    requesterDomain &&
    skipDomains.has(requesterDomain) &&
    publicAgentReplyCount === 0
  ) {
    reasons.push(`skip_domain:${requesterDomain}`);
    decision = "skip";
  }

  if (decision !== "skip") {
    if (publicAgentReplyCount > 0) {
      reasons.push("has_public_agent_reply");
      decision = "import";
    } else if (status === "Open" || status === "Pending") {
      reasons.push("active_open_or_pending");
      decision = "import";
    } else if (!lowPriority && requesterDomain && !skipDomains.has(requesterDomain)) {
      reasons.push("non_low_priority");
      decision = "import";
    } else if (tagNames.length > 0) {
      reasons.push("has_freshdesk_tags");
      decision = "import";
    } else if (attachmentMetadataCount > 0) {
      reasons.push("has_attachment_metadata");
      decision = "review";
    } else {
      reasons.push("ambiguous_no_public_agent_reply");
      decision = "review";
    }
  }

  return {
    attachmentMetadataCount,
    createdAt: record.created_at ?? null,
    decision,
    displayId: record.display_id ?? null,
    fileName: input.fileName,
    freshdeskId: record.id ?? null,
    incomingCustomerNoteCount,
    internalNoteCount,
    priority,
    publicAgentReplyCount,
    reasons,
    requesterDomain,
    requesterEmail,
    requesterName: record.requester?.name ?? record.requester_name ?? null,
    source: record.source_name ?? null,
    status,
    subject: record.subject ?? "",
    tagCount: tagNames.length,
    tags: tagNames,
    updatedAt: record.updated_at ?? null,
    wrapper: input.wrapper,
  };
}

export function getNotes(record) {
  return [...(record.notes ?? []), ...(record.archive_notes ?? [])];
}

export function getAttachments(record) {
  const attachments = [...(record.attachments ?? [])];

  for (const note of getNotes(record)) {
    attachments.push(...(note.attachments ?? []));
  }

  return attachments;
}

export function isPublicAgentReply(note) {
  return note.incoming === false && note.private === false && !note.deleted;
}

export function getTagNames(record) {
  return (record.tags ?? [])
    .map((tag) => (typeof tag === "string" ? tag : tag?.name))
    .filter(Boolean);
}

export function getRequesterEmail(record) {
  return String(record.requester?.email ?? "").trim().toLowerCase();
}

export function getEmailDomain(email) {
  const atIndex = email.lastIndexOf("@");
  return atIndex === -1 ? "" : email.slice(atIndex + 1).toLowerCase();
}

export function mapStatus(statusName) {
  switch (statusName) {
    case "Open":
      return "OPEN";
    case "Pending":
      return "PENDING";
    case "Resolved":
      return "RESOLVED";
    case "Closed":
      return "CLOSED";
    default:
      return "OPEN";
  }
}

export function mapPriority(priorityName) {
  switch (priorityName) {
    case "Low":
      return "LOW";
    case "Medium":
      return "NORMAL";
    case "High":
      return "HIGH";
    case "Urgent":
      return "URGENT";
    default:
      return "NORMAL";
  }
}

export function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAddress(name, email) {
  if (!email) {
    return null;
  }

  return name ? `${name} <${email}>` : email;
}

export function formatEmailList(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ") || null;
  }

  if (typeof value === "string") {
    return value || null;
  }

  return null;
}

export function stripHtml(html) {
  if (!html) {
    return "";
  }

  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

export function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = Array.isArray(value) ? value.join("; ") : String(value);

  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function summarizeClassifications(classifications) {
  const summary = {
    byDecision: {},
    byReason: {},
    total: classifications.length,
  };

  for (const classification of classifications) {
    summary.byDecision[classification.decision] =
      (summary.byDecision[classification.decision] ?? 0) + 1;

    for (const reason of classification.reasons) {
      summary.byReason[reason] = (summary.byReason[reason] ?? 0) + 1;
    }
  }

  return summary;
}

class ZipReader {
  constructor(zipPath) {
    this.buffer = readFileSync(zipPath);
    this.entryList = this.readCentralDirectory();
  }

  entries() {
    return this.entryList;
  }

  readEntry(entry) {
    const buffer = this.buffer;
    const localOffset = entry.localHeaderOffset;

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header for ${entry.fileName}`);
    }

    const fileNameLength = buffer.readUInt16LE(localOffset + 26);
    const extraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      return compressed;
    }

    if (entry.compressionMethod === 8) {
      return inflateRawSync(compressed);
    }

    throw new Error(
      `Unsupported zip compression method ${entry.compressionMethod} for ${entry.fileName}`,
    );
  }

  readCentralDirectory() {
    const buffer = this.buffer;
    const maxCommentLength = 0xffff;
    const searchStart = Math.max(0, buffer.length - maxCommentLength - 22);
    let eocdOffset = -1;

    for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error("Could not find zip end of central directory.");
    }

    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    const entries = [];
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error("Invalid zip central directory header.");
      }

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const fileName = buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf8");

      entries.push({
        compressedSize,
        compressionMethod,
        fileName,
        localHeaderOffset,
        uncompressedSize,
      });

      offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
  }
}
