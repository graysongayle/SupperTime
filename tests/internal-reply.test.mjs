import assert from "node:assert/strict";
import test from "node:test";
import { getInternalReplyRecipients } from "../src/lib/internal-reply.ts";

const message = {
  emailFrom: "Rep <rep@example.com>",
  emailTo: "Support <support@example.com>, colleague@example.com",
  emailCc: null,
  agent: null,
};
const recipients = (overrides = {}) =>
  getInternalReplyRecipients({ ...message, ...overrides }, "support@example.com", null);

test("emails only people on the internal message, ignoring ticket customer data", () => {
  assert.deepEqual(recipients({ customer: { email: "customer@example.com" } }), [
    "rep@example.com", "colleague@example.com",
  ]);
});

test("includes a customer only when their address appears on the message", () => {
  assert.deepEqual(recipients({ emailCc: "customer@example.com" }), [
    "rep@example.com", "colleague@example.com", "customer@example.com",
  ]);
});

test("deduplicates case-insensitively and removes support reply aliases", () => {
  assert.deepEqual(recipients({
    emailCc: "REP@EXAMPLE.COM, support+ticket-token@example.com, other@example.com",
  }), ["rep@example.com", "colleague@example.com", "other@example.com"]);
});

test("uses the agent author for notes with no From metadata", () => {
  assert.deepEqual(recipients({
    emailFrom: null, emailTo: null, agent: { email: "agent@example.com" },
  }), ["agent@example.com"]);
});

test("uses the linked author instead of legacy From metadata without adding ticket customers", () => {
  assert.deepEqual(recipients({
    emailTo: null, agent: { email: "unrelated@example.com" },
    customer: { email: "customer@example.com" },
  }), ["unrelated@example.com"]);
});

test("returns no recipients when there are no non-support addresses", () => {
  assert.deepEqual(recipients({ emailFrom: null, emailTo: "support@example.com" }), []);
});

const support = "support@example.com";
const sender = "philip@example.com";
const original = {
  agent: { email: "jodi@example.com" },
  emailFrom: "Philip <philip@example.com>",
  emailTo: "philip@example.com",
  emailCc: null,
};

test("legacy From metadata cannot replace the linked note author", () => {
  assert.deepEqual(getInternalReplyRecipients(original, support, sender), ["jodi@example.com"]);
});

test("reply-all preserves original recipients, removes sender and support aliases, and deduplicates", () => {
  assert.deepEqual(getInternalReplyRecipients({
    ...original,
    emailTo: "PHILIP@example.com, Sam <sam@example.com>, support@example.com",
    emailCc: "SAM@example.com, support+ticket_123@example.com, Lee <lee@example.com>",
  }, support, " Philip@Example.com "), ["jodi@example.com", "sam@example.com", "lee@example.com"]);
});

test("messages without a linked author use the original From address", () => {
  assert.deepEqual(getInternalReplyRecipients({ ...original, agent: null, emailFrom: "Jodi <jodi@example.com>" }, support, sender), ["jodi@example.com"]);
});

test("an author replying to their own note emails only the other original recipients", () => {
  assert.deepEqual(getInternalReplyRecipients(original, support, "jodi@example.com"), [sender]);
});

test("no fallback to ticket customers or participants when no recipients remain", () => {
  assert.deepEqual(getInternalReplyRecipients({ ...original, agent: null, emailFrom: sender, emailTo: support }, support, sender), []);
});
