# Implementation Plan

This is the living execution plan for Suppertime Helpdesk. Update statuses as work lands.

Status key: `Done`, `In Progress`, `Pending`, `Blocked`.

## Phase 0: Foundation

Status: `Done`

- `Done` Scaffold Next.js, TypeScript, Tailwind, shadcn/ui, and pnpm.
- `Done` Configure Clerk authentication.
- `Done` Configure Prisma with Neon/PostgreSQL.
- `Done` Define core schema for users, customers, tickets, messages, attachments, tags, status history, and Freshdesk imports.
- `Done` Add first super-admin bootstrap command.
- `Done` Add guest-only default access for newly registered users.
- `Done` Add super-admin role management.
- `Done` Add shared app layout/navigation.
- `Done` Move dashboard to `/tickets` and redirect `/` to `/tickets`.
- `Done` Replace static dashboard data with Prisma-backed data.
- `Done` Add deterministic sample data seed.

## Phase 1: Ticket Core

Status: `Done`

- `Done` Add ticket detail route.
- `Done` Show customer, status, priority, assignee, tags, source, dates, and message count on ticket detail.
- `Done` Add ticket message timeline.
- `Done` Add internal notes.
- `Done` Add status update action.
- `Done` Add priority update action.
- `Done` Add assignment update action.
- `Done` Add tag add/remove actions.
- `Done` Add create-ticket flow for internal users.
- `Done` Add empty, loading, and not-found states for ticket routes.

## Phase 2: Search And Queue Workflow

Status: `Done`

- `Done` Add ticket list filtering by status.
- `Done` Add ticket list filtering by assignee.
- `Done` Add ticket list filtering by priority.
- `Done` Add basic full-text search over subject, customer email/name, and message body.
- `Done` Add saved queue links in navigation.
- `Done` Make ticket counts reflect active filters where appropriate.

## Phase 3: Attachments

Status: `Pending`

- `Pending` Choose attachment storage provider.
- `Pending` Add upload UI for internal ticket notes/replies.
- `Pending` Add attachment metadata persistence.
- `Pending` Add attachment download links.
- `Pending` Enforce file size and content-type limits.

## Phase 4: Email Workflow

Status: `In Progress`

- `Done` Choose email provider and inbound delivery mechanism: separate Postmark dev/prod servers, Google Workspace forwarding from `support@psychdata.com`, and Postmark inbound webhooks.
- `Done` Add inbound email webhook route.
- `Done` Create tickets from new inbound messages.
- `Done` Thread customer replies onto existing tickets.
- `Done` Preserve provider message IDs and thread IDs.
- `Done` Add app-owned thread token generation for reliable reply matching.
- `Done` Add structured ticket participants for requesters and CC recipients.
- `Done` Add per-message From/To/CC snapshots and ticket-participant fallback display in the response timeline.
- `Done` Add outbound agent reply action.
- `Done` Allow agent replies to select CC participants and add new CC recipients.
- `Done` Send outbound replies through Postmark using environment-backed support sender settings.
- `Done` Send customer confirmation emails after successful ticket creation.
- `Done` Store outbound replies in the ticket timeline.
- `Done` Add ticket-level forward action with internal-note audit logging.
- `Done` Record inbound attachment presence as internal notes until attachment storage is chosen.
- `Pending` Store inbound and outbound attachment files after Phase 3 attachment storage is chosen.

## Phase 5: Embedded Support Form

Status: `Pending`

- `Pending` Add public support form route.
- `Pending` Add JavaScript embed loader for the survey app.
- `Pending` Configure allowed embed/submit origins via environment variable.
- `Pending` Add first-pass fields: name, email, subject, message, and optional customer-visible priority if needed.
- `Pending` Create tickets from support form submissions.
- `Pending` Send customer confirmation emails after successful form submission.
- `Pending` Add hidden honeypot protection.
- `Pending` Add basic rate limiting.
- `Pending` Defer file uploads until Phase 3 attachment storage is chosen.

## Phase 6: Freshdesk Migration

Status: `Pending`

- `Pending` Add CSV upload/import screen.
- `Pending` Map Freshdesk ticket fields to local ticket fields.
- `Pending` Preserve Freshdesk ticket IDs.
- `Done` Link imported tickets to Freshdesk import runs for repeatable cleanup.
- `Done` Add super-admin maintenance cleanup for deleting tickets from a specific import run.
- `Pending` Preserve dates where available.
- `Pending` Import conversations when available.
- `Pending` Import tags/status history where practical.
- `Pending` Add import summary and row-level error reporting.

## Phase 7: Permissions And Auditability

Status: `Pending`

- `Pending` Centralize role/permission checks for server actions and routes.
- `Pending` Add manager/agent permission boundaries.
- `Pending` Add role-change audit entries.
- `Pending` Add ticket status/assignment/priority change audit entries.
- `Pending` Add explicit inactive-user handling.
- `Done` Add super-admin user history view for recorded ticket replies, internal notes, and status changes.
- `Done` Track and display user last login, last activity, and last ticket action timestamps.
- `Done` Add super-admin-only permanent deletion for closed tickets.
- `Done` Add env-gated super-admin development reset for deleting all tickets.

## Phase 8: Production Readiness

Status: `Pending`

- `Pending` Add deployment configuration.
- `Pending` Add production environment variable checklist.
- `Pending` Add logging/error handling strategy.
- `Pending` Add backup/export notes.
- `Pending` Add basic tests for role rules.
- `Pending` Add basic tests for ticket mutations.
- `Pending` Add tests for email threading once email is implemented.

## Current Recommended Next Step

Start Phase 3 attachment workflow:

1. Choose the attachment storage provider.
2. Add upload UI for internal notes/replies.
3. Persist attachment metadata and expose download links.

## Confirmed Decisions

- Email remains the primary customer support channel.
- Use separate Postmark servers for development and production.
- Use `PsychData Support <support@psychdata.com>` for outbound support replies and customer confirmations.
- Route every email to `support@psychdata.com` into Suppertime unless it matches an existing thread.
- Keep inbound email tickets unassigned by default and visible to agents.
- Secure the Postmark inbound webhook with an environment-backed shared secret.
- Configure allowed support form origins with an environment variable.
- Use a JavaScript embed for the survey app instead of an iframe.
- Use hidden honeypot fields and basic rate limiting for first-pass spam protection.
- Do not build a customer portal yet.
- Defer attachment storage decisions for now.

Planned environment variables:

```env
POSTMARK_SERVER_TOKEN=
POSTMARK_INBOUND_WEBHOOK_SECRET=
SUPPORT_FROM_EMAIL=support@psychdata.com
SUPPORT_FROM_NAME=PsychData Support
SUPPORT_ALLOWED_ORIGINS=
```
