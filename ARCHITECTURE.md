# Architecture

## Application

The app uses Next.js App Router with server components by default. Clerk protects internal routes through `src/proxy.ts`; public customer entry points are reserved under `/support`, `/api/support-form`, and `/api/inbound-email`.

Development mode allows the app shell to render without Clerk keys so setup can proceed before credentials exist. Production should provide Clerk keys and remains protected by default.

## Data

Prisma models live in `prisma/schema.prisma`. The schema is centered on:

- `Ticket`
- `TicketMessage`
- `Customer`
- `User`
- `Attachment`
- `Tag`
- `TicketStatusHistory`
- `FreshdeskImport`

Prisma 7 generates the client into `src/generated/prisma`. Runtime access should go through `src/lib/prisma.ts`.

## Integrations

- Clerk provides internal authentication.
- PostgreSQL is the source of truth for support data.
- Email ingestion and outbound delivery are not implemented yet; webhook route names are reserved.
- Attachment storage is not implemented yet; storage metadata is represented in the schema.

## UI Conventions

Destructive confirmation dialogs should use the shared shadcn-style dialog primitives in `src/components/ui/dialog.tsx`. Keep destructive confirmations visually consistent: use a red-accented dialog, a warning icon, a concise title naming the object being changed, explanatory body text that states the action cannot be undone, and footer actions ordered as Cancel first and the destructive action second. For irreversible operations, require an additional typed confirmation before opening the final dialog.
