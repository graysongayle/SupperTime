# Decisions

## 2026-10-20: Restrict internal reply email to the original message

Internal replies remain internal notes. The server derives email recipients solely from the original internal message's From, To, and Cc addresses, falling back to its agent author only when From is absent. Support addresses are excluded. Ticket customers and participants are never added automatically; a customer receives an internal reply only when their address appears on the original message. Mentions cannot add recipients to internal replies.

New internal notes retain their author and notified recipients for subsequent replies. Internal reply emails contain only the new reply, and email responses go to the replying agent's mailbox so they cannot enter the public customer reply ingestion flow.

## 2026-06-04: Use pnpm

Use pnpm as the package manager for faster installs, stricter dependency resolution, and good compatibility with modern Next.js projects.

## 2026-06-04: Use Prisma 7 Generated Client Output

Prisma is configured to generate the client into `src/generated/prisma`, matching the Prisma 7 default scaffold and keeping generated database code explicit.

## 2026-06-04: Reserve Public Support Routes

Clerk middleware protects internal routes by default. `/support`, `/api/support-form`, and `/api/inbound-email` are reserved as public customer or webhook entry points.
