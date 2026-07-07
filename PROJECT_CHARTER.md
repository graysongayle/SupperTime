# HelpDesk Replacement Project Plan

## Project Overview

Build a lightweight, standalone helpdesk application to replace Freshdesk for internal company use.

The application should focus on simplicity, maintainability, and ownership of data while providing the core capabilities required to support customers of a SaaS platform.

This is not intended to be a full Freshdesk competitor. The goal is to build a focused support platform that solves our current needs while providing a foundation for future expansion.

---

# Goals

## Primary Goals

- Eliminate dependency on Freshdesk.
- Own all support data and workflows.
- Support email-based ticket creation and responses.
- Provide an embeddable support form for websites and applications.
- Support multiple agents with role-based permissions.
- Allow import of historical Freshdesk ticket data.
- Keep operational costs low.
- Keep the architecture simple enough for a solo founder or small team to maintain.

## Success Criteria

The application will be considered successful when:

- Incoming emails automatically create tickets.
- Customer email replies are attached to existing tickets.
- Agents can manage tickets through a web interface.
- Website visitors can submit support requests through an embedded form.
- Historical Freshdesk tickets can be imported.
- The system can operate entirely without Freshdesk.

---

# Initial Scope (MVP)

## Authentication

- Internal user authentication only.
- Clerk authentication provider.
- Support for:
  - Super Admin
  - Manager
  - Agent

Future SSO support should be possible but is not required for MVP.

---

## Ticket Management

Support:

- Ticket creation
- Ticket assignment
- Ticket status management
- Ticket priorities
- Ticket tagging
- Internal notes
- Ticket search
- Ticket filtering
- Attachments

Tickets should support the following statuses:

- Open
- Pending
- Waiting on Customer
- Waiting on Third Party
- Resolved
- Closed

---

## Email to Ticket

The system must support:

- Creating tickets from incoming emails.
- Appending replies to existing tickets.
- Sending agent responses through email.
- Preserving conversation history.
- Supporting attachments.

Email should remain the primary customer interaction channel.

Customers should not need to create accounts.

---

## Embedded Support Form

Provide a publicly accessible support form.

Requirements:

- Embeddable on external websites.
- Support file attachments.
- Configurable fields.
- Generates tickets automatically.

Initial implementation may use an iframe-based approach.

---

## Agent Experience

Agents should be able to:

- View ticket inbox.
- View ticket details.
- Reply to tickets.
- Add internal notes.
- Assign tickets.
- Update ticket status.
- Update priority.
- Filter tickets.
- Search tickets.

Focus on usability and efficiency.

---

## Freshdesk Migration

Support import of historical Freshdesk ticket data.

Requirements:

- CSV-based import initially.
- Preserve original identifiers when possible.
- Preserve dates when possible.
- Preserve status history where practical.
- Preserve ticket conversations when available.

This is primarily a one-time migration capability.

---

# Out of Scope (MVP)

The following features should NOT be built during MVP:

## Customer Portal

- Customer accounts
- Customer login
- Customer ticket dashboard

## Knowledge Base

- Articles
- FAQs
- Documentation portal

## Automation

- SLA rules
- Escalation rules
- Auto-assignment
- Workflow automation

## Multi-Tenant Support

- Company registration
- Multiple organizations
- Billing
- Subscription management

## Live Chat

- Website chat widgets
- Real-time messaging

## AI Features

- AI ticket summaries
- AI response generation
- AI routing

These may be considered after MVP.

---

# Technical Direction

## Technology Stack

Preferred stack:

- Next.js
- TypeScript
- Clerk
- Prisma
- Neon PostgreSQL
- Tailwind
- shadcn/ui

The application should remain deployable on modern cloud platforms without requiring significant infrastructure management.

---

## Architectural Principles

### Keep It Simple

Prefer the simplest solution that meets requirements.

### Avoid Premature Multi-Tenancy

Design cleanly but optimize for a single organization.

### Maintainability First

Favor clarity and maintainability over cleverness.

### AI-Friendly Repository

Repository structure should be optimized for AI-assisted development.

### Documentation Driven

Major architectural and product decisions should be documented.

---

# Documentation Requirements

The repository should contain:

- AGENT.md
- PRODUCT.md
- ARCHITECTURE.md
- NFR.md
- DECISIONS.md
- ROADMAP.md

Future AI agents should consult these files before making significant changes.

Major decisions should be recorded in DECISIONS.md.

---

# Suggested Milestones

## Milestone 1

Project foundation.

- Repository setup
- Authentication
- User management
- Database setup

## Milestone 2

Core ticketing.

- Ticket model
- Ticket inbox
- Ticket detail view
- Status management
- Assignment

## Milestone 3

Communication.

- Email ingestion
- Email replies
- Attachments

## Milestone 4

Embedded support form.

- Public form
- Ticket creation
- Attachment support

## Milestone 5

Migration.

- Freshdesk import
- Validation
- Data cleanup

## Milestone 6

Polish.

- Filtering
- Search
- Dashboard metrics
- Documentation updates

---

# Future Considerations

Potential future enhancements:

- Customer portal
- Knowledge base
- SSO
- Multi-tenancy
- Billing
- Automation rules
- AI-assisted support
- SLA management
- Team queues
- Public API
- Webhooks
- Mobile support

These should not influence MVP decisions unless specifically required.

---

# Final Guidance for AI Agents

Build the smallest practical solution that fully satisfies MVP requirements.

Do not add enterprise features unless explicitly requested.

When faced with multiple implementation options:

1. Prefer simplicity.
2. Prefer maintainability.
3. Prefer lower operational cost.
4. Prefer solutions that can be understood quickly by future AI agents.
5. Document important decisions.
