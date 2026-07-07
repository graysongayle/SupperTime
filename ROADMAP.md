# Roadmap

## Phase 1: Foundation

- Scaffold Next.js app and shared UI system.
- Define Prisma data model.
- Configure Clerk route protection.
- Build static agent inbox shell.

## Phase 2: Core Tickets

- Implement authenticated agent layout.
- Create ticket list and ticket detail pages backed by Prisma.
- Add status, priority, assignment, tags, internal notes, and attachments metadata.

## Phase 3: Email Workflows

- Add inbound email webhook.
- Create tickets from inbound messages.
- Thread replies onto existing tickets.
- Send agent replies through an email provider.

## Phase 4: Public Support Form

- Add embeddable support form.
- Validate configurable fields.
- Support file uploads.
- Generate tickets from submissions.

## Phase 5: Freshdesk Import

- Add CSV upload/import flow.
- Preserve Freshdesk identifiers and dates where available.
- Import conversations when export data includes them.
