# Freshdesk Import Plan

## Goal

Import real historical Freshdesk customer tickets while aggressively avoiding spam,
automated notifications, and low-value tickets with no real customer interaction.
The import does not need to be perfect. If a real ticket is missed, it can be
recovered later from the original email account or Freshdesk export.

The most critical safety requirement is that import operations must never send
outbound email. Import code must not call ticket creation flows that send customer
auto-responses, confirmations, replies, or forward emails.

## Export Summary

The export at `imports/2303908.zip` contains 5,629 ticket records:

- 4,776 current Freshdesk tickets wrapped as `helpdesk_ticket`.
- 853 archived Freshdesk tickets wrapped as `helpdesk_archive_ticket`.
- 5,273 tickets have no public agent reply.
- 4,492 tickets have no notes at all.
- 4,249 tickets have no notes, no public replies, and no tags.
- 4,232 tickets are closed/resolved, low priority, and have no notes, replies, or
  tags. These are strong skip candidates because there is no evidence of real
  support interaction, not because closed/resolved tickets are inherently
  low-value.

## What Archived Tickets Mean

In Freshdesk, archived tickets are old tickets moved out of the normal active
ticket storage/view to reduce clutter and improve performance. In this export,
archived tickets are structurally different:

- They use `helpdesk_archive_ticket` instead of `helpdesk_ticket`.
- They include `archive_notes` instead of `notes`.
- They do not include the full `requester` object found on active tickets.
- In this export, all 853 archived tickets are missing `requester.email`.

Because local `Customer.email` is required, archived tickets need special handling.
The default plan is to skip archived tickets for the first import. They can be
revisited later if needed, but they should not be part of the initial test or full
import.

## Non-Negotiable Email Safety

The importer must write directly through Prisma or a dedicated import service that
does not send email.

The importer must not call:

- `createTicket`
- `addPublicReply`
- `forwardTicket`
- `sendSupportEmail`
- `sendCustomerConfirmation`
- any route/action that can trigger an auto-response or outbound reply

Imported tickets should set `source` to `FRESHDESK_IMPORT` and should not create
customer confirmation emails, reply emails, forwarding emails, or Postmark sends.

Before any test import, add a guardrail to the importer design:

- No imports run through app server actions intended for live ticket creation.
- No import path imports from `src/lib/support-email.ts` except possibly pure
  formatting helpers after manual review.
- Test imports run with outbound email environment variables absent or disabled.
- Import runs set an explicit import-mode email suppression guard. If any import
  path attempts to send outbound email, the run should fail before sending.
- Import logs should include `emailSendCount: 0` or equivalent verification.
- Full and test imports must finish with a positive assertion that outbound email
  sends were suppressed and that zero outbound emails were attempted.

## Spam And Noise Filtering

The import should have a classifier stage before the database write stage. The
classifier should produce a reviewable report with one row per Freshdesk ticket:

- Freshdesk internal `id`
- Freshdesk visible `display_id`
- wrapper type: active or archived
- subject
- requester name
- requester email, when available
- requester domain
- status
- priority
- source
- created/updated dates
- public agent reply count
- internal note count
- incoming customer note count
- tag count
- attachment metadata count
- proposed decision: `import`, `skip`, or `review`
- reason codes

### Automatic Skip Rules

Closed or resolved status does not make a ticket low priority and does not make it
safe to skip. A ticket that was closed after a real customer interaction should be
imported.

Automatically skip only low-value tickets with no public agent reply:

- `status_name` is `Closed` or `Resolved`
- `priority_name` is `Low`
- public agent reply count is `0`
- no tags
- no attachment metadata

Internal notes do not make a ticket real by themselves. A private/internal note is
useful context only if the ticket is imported for another reason.

Do not apply a domain skip filter by default. Domain filtering was useful during
early analysis, but the first full import should favor keeping potentially useful
vendor/support/billing history instead of excluding it.

Keep domain skipping available as an explicit optional filter. If needed later,
start from this configurable skip-domain list:

- `godaddy.com`
- `e.godaddy.com`
- `registry.godaddy`
- `google.com`
- `accounts.google.com`
- `digicert.com`
- `sherweb.com`
- `wordpress.com`
- `dashlane.com`
- `qualys.net`
- `mail.instagram.com`

This list must be configurable without code changes, preferably by CLI option,
JSON config file, or environment variable. It should not be active unless
explicitly passed to the classifier/importer.

Do not auto-skip these domains by default, because they may contain useful support
or billing history:

- `stripe.com`
- `microsoft.com`
- `sns.amazonaws.com`
- `postmarkapp.com`
- `fyi.postmarkapp.com`

### Import Signals

Import tickets that have clear evidence of real customer support handling:

- At least one public agent reply.
- Active `Open` or `Pending` status even when old, unless an automatic skip rule
  applies.
- Non-low priority.
- Freshdesk tags that indicate customer relevance.
- Attachment metadata plus another import signal.

### Review Signals

Mark ambiguous tickets as `review` in the classifier report, but include review
tickets in the initial import unless an automatic skip rule applies. The goal is
to avoid missing real customer tickets; false positives can be cleaned up by
import run if needed.

- Active tickets with no public agent reply but non-low priority.
- Tickets with attachment metadata but no public agent reply.

## Import Scope

For now, import all accepted tickets into one general bucket. Do not classify
tickets into Freshdesk groups, products, or local routing groups.

Do not preserve Freshdesk assignment in the first import. Imported tickets should
be unassigned. The app currently has one main agent managing incoming tickets, and
assignment can be handled manually after import if needed.

## Data Mapping

### Tickets

- Use new local `Ticket.number` values generated by the app/database. Do not force
  Freshdesk `display_id` into the local ticket number, because this avoids
  collisions and sequence issues in the existing database.
- Preserve Freshdesk `display_id` in `Ticket.externalId` using a stable value such
  as `freshdesk-display:{display_id}`.
- Freshdesk `id` -> local `Ticket.freshdeskTicketId`.
- Import run ID -> local `Ticket.freshdeskImportId`.
- Import timestamp -> local `Ticket.freshdeskImportedAt`.
- Freshdesk `subject` -> local `Ticket.subject`, with a fallback like
  `Freshdesk ticket {display_id}` for empty subjects.
- Freshdesk `description` -> local `Ticket.description`.
- Freshdesk `description_html` -> initial message `bodyHtml`.
- Local `Ticket.source` -> `FRESHDESK_IMPORT`.

### Status

- `Open` -> `OPEN`
- `Pending` -> `PENDING`
- `Resolved` -> `RESOLVED`
- `Closed` -> `CLOSED`

### Priority

- `Low` -> `LOW`
- `Medium` -> `NORMAL`
- `High` -> `HIGH`
- `Urgent` -> `URGENT`

### Customers

Customers are required by the local database because every local `Ticket` needs a
`customerId`. Import only the minimum customer data needed to satisfy that
relationship.

For active tickets:

- Use `requester.email` as the unique key.
- Store `requester.name` if present.
- Do not import full Freshdesk contact profiles.
- Do not overwrite existing local customer data unless the existing name is blank.
- Do not create customers for skipped tickets.

Archived tickets do not include requester email in this export. Default behavior:
skip archived tickets for the first import.

### Messages

Create an initial public customer message from the ticket description when present.
Store both available formats:

- Freshdesk plain text fields -> local message `body`.
- Freshdesk HTML fields -> local message `bodyHtml`.

The app already sanitizes message HTML for display, so preserving HTML gives better
historical fidelity while keeping plain text available for previews and fallback.

Import Freshdesk notes as ticket messages ordered by `created_at`:

- `incoming: true` -> customer public message.
- `incoming: false`, `private: false` -> agent public reply.
- `private: true` -> internal note.

Deleted notes should be skipped by default.

### Tags

Do not import Freshdesk tags into local `Tag` / `TicketTag` rows in the first pass.

Use Freshdesk tags only as classifier signals. For example, a ticket tagged
`Billing` may be more likely to be a real customer ticket, but the importer should
not create a local `Billing` tag during the first test import.

This keeps cleanup simpler and avoids importing old Freshdesk taxonomy before it
is clear that local tags are useful.

### Attachments

Do not download or store actual attachment files in the first pass.

Import attachment metadata only when the ticket itself is imported:

- file name
- content type
- file size
- Freshdesk attachment ID
- Freshdesk export URL when available

Because the app's attachment storage workflow is not finished, attachment metadata
may also be represented as an internal system note if that is simpler for the first
test batch.

## Test Batch Plan

Build the test batch from classifier output, not from the first N records.

Recommended test batch:

- 10 importable tickets with public agent replies.
- 5 tickets where Freshdesk tags affect the classifier decision.
- 3 tickets with attachment metadata.
- 3 active open/pending tickets.
- 5 automatic skip examples.
- 5 review examples.

The first database write test should import 25-50 tickets. Start small enough that
manual UI review is realistic, but large enough to exercise conversations,
metadata-only attachments, open/pending tickets, included review tickets, and
automatic skip cases.

Run the test import into the existing database using an import run linked by
`freshdeskImportId`. There is no disposable database for this project right now,
so import-run scoped cleanup is the rollback boundary.

Classifier and dry-run reports should be written under `imports/reports/` with
timestamped names. Reports should include both machine-readable JSON and a
human-readable CSV when practical.

The full import should require an explicit confirmation flag such as
`--confirm-full-import`. The default command behavior should be dry-run or
test-batch oriented, not a full write.

If a Freshdesk ticket ID already exists locally in `Ticket.freshdeskTicketId`, skip
that ticket by default. This makes reruns safer.

Imported tickets should preserve Freshdesk status. Closed and resolved tickets that
are imported should remain closed/resolved, including `closedAt` and `resolvedAt`
where Freshdesk provides reliable timestamps.

## Verification Checklist

Before database writes:

- Classifier report reviewed.
- Vendor domain list reviewed.
- Skip reasons look sensible.
- Import script confirmed to avoid all outbound email code paths.
- Import-mode email suppression guard enabled.

After test import:

- Imported ticket count matches classifier `import` plus included `review` count
  for the batch.
- Skipped ticket count matches classifier `skip` count for the batch.
- No outbound emails were sent.
- Import logs explicitly verify `emailSendCount: 0` or equivalent.
- Imported tickets show as `FRESHDESK_IMPORT`.
- Freshdesk IDs are preserved.
- Messages appear in chronological order.
- Public agent replies are visible as public messages.
- Internal notes are visible only as internal notes.
- Freshdesk tags influence classifier decisions but are not imported as local tags.
- Attachment metadata is present or summarized as internal notes.
- The entire test run can be deleted through import-run cleanup.

## Suggested Implementation Steps

1. Add a read-only classifier script for `imports/2303908.zip`.
2. Add configurable vendor-domain and skip-rule settings.
3. Generate and review a classifier report.
4. Generate a representative test batch from report decisions.
5. Add an import script that writes directly through Prisma and never sends email.
6. Run the test batch into an import-run-scoped database state.
7. Verify UI behavior and import-run cleanup.
8. Adjust skip/review rules.
9. Run the full import only after the test batch is clean.
