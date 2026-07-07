# Agent Notes

## Project Intent

Build a focused internal helpdesk replacement for Freshdesk. Keep the product small, maintainable, and optimized for email-based support workflows.

## Engineering Defaults

- Use the existing stack: Next.js, TypeScript, Clerk, Prisma, PostgreSQL, Tailwind, shadcn/ui, pnpm.
- Prefer simple server-side flows before adding background infrastructure.
- Keep public customer-facing surfaces accountless.
- Keep MVP scope single-organization. Do not add billing or multi-tenant abstractions unless the charter changes.
- Document significant product or architecture decisions in `DECISIONS.md`.

## Useful Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm db:generate
pnpm db:migrate
```
