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
  getInternalReplyRecipients({ ...message, ...overrides }, "support@example.com");

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

test("does not add an agent or customer fallback when From is present", () => {
  assert.deepEqual(recipients({
    emailTo: null, agent: { email: "unrelated@example.com" },
    customer: { email: "customer@example.com" },
  }), ["rep@example.com"]);
});

test("returns no recipients when there are no non-support addresses", () => {
  assert.deepEqual(recipients({ emailFrom: null, emailTo: "support@example.com" }), []);
});
