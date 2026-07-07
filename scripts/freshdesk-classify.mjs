import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  classifyRecord,
  csvEscape,
  defaultSkipDomains,
  parseArgs,
  readFreshdeskRecords,
  summarizeClassifications,
} from "./lib/freshdesk-import-utils.mjs";

const args = parseArgs(process.argv.slice(2));
const zipPath = String(args.zip ?? "imports/2303908.zip");
const reportsDir = String(args["reports-dir"] ?? "imports/reports");
const skipDomains = parseDomainList(args["skip-domains"]) ?? defaultSkipDomains;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportBase = path.join(reportsDir, `freshdesk-classification-${timestamp}`);

mkdirSync(reportsDir, { recursive: true });

const records = readFreshdeskRecords(zipPath);
const classifications = records.map((record) =>
  classifyRecord(record, {
    skipDomains,
  }),
);
const summary = summarizeClassifications(classifications);

writeFileSync(
  `${reportBase}.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      skipDomains,
      sourceZip: zipPath,
      summary,
      tickets: classifications,
    },
    null,
    2,
  ),
);

writeFileSync(`${reportBase}.csv`, toCsv(classifications));

console.log(`Classified ${classifications.length} Freshdesk tickets.`);
console.log(`Decision counts: ${JSON.stringify(summary.byDecision)}`);
console.log(`JSON report: ${reportBase}.json`);
console.log(`CSV report: ${reportBase}.csv`);

function parseDomainList(value) {
  if (!value || value === true) {
    return null;
  }

  return String(value)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function toCsv(classifications) {
  const headers = [
    "decision",
    "reasons",
    "freshdeskId",
    "displayId",
    "wrapper",
    "status",
    "priority",
    "source",
    "createdAt",
    "updatedAt",
    "requesterName",
    "requesterEmail",
    "requesterDomain",
    "subject",
    "publicAgentReplyCount",
    "internalNoteCount",
    "incomingCustomerNoteCount",
    "tagCount",
    "tags",
    "attachmentMetadataCount",
    "fileName",
  ];

  const lines = [headers.join(",")];

  for (const classification of classifications) {
    lines.push(
      headers
        .map((header) => {
          if (header === "reasons") {
            return csvEscape(classification.reasons);
          }

          return csvEscape(classification[header]);
        })
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}
