# Agent Notes

## Project Intent

Build a focused internal helpdesk replacement for Freshdesk. Keep the product small, maintainable, and optimized for email-based support workflows.

## Engineering Defaults

- Before significant changes, consult the relevant project docs: `PRODUCT.md`, `ARCHITECTURE.md`, `NFR.md`, `DECISIONS.md`, and `ROADMAP.md`.
- Use the existing stack: Next.js, TypeScript, Clerk, Prisma, PostgreSQL, Tailwind, shadcn/ui, pnpm.
- Prefer simple server-side flows before adding background infrastructure.
- Keep public customer-facing surfaces accountless.
- Keep MVP scope single-organization. Do not add billing or multi-tenant abstractions unless the charter changes.
- For all UI changes, check and optimize the mobile experience as part of the work. New features and screen enhancements should account for small screens, touch targets, table-to-card transformations where useful, responsive action placement, and menus that stay inside the viewport.
- Document significant product or architecture decisions in `DECISIONS.md`.
- After code changes, run the most relevant available check, usually `pnpm lint`, `pnpm build`, or a targeted validation command. If a command cannot run in the current environment, state that clearly.

## Useful Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm db:generate
pnpm db:migrate
```
