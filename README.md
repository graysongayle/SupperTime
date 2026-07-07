# Suppertime Helpdesk

Lightweight internal helpdesk application to replace Freshdesk for a single company support team.

## Stack

- Next.js App Router
- TypeScript
- Clerk authentication
- Prisma 7
- Neon/PostgreSQL
- Tailwind CSS 4
- shadcn/ui
- pnpm

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm dev
```

Set `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY` in `.env` before using authenticated routes or database-backed features.

For Neon/PostgreSQL, prefer `sslmode=verify-full` in `DATABASE_URL`.

In development only, the app renders without Clerk keys so the scaffold can be inspected before credentials are available. Production keeps Clerk enabled.

## Scripts

- `pnpm dev` - start the development server
- `pnpm build` - create a production build
- `pnpm lint` - run ESLint
- `pnpm db:generate` - generate the Prisma client
- `pnpm db:migrate` - run a local Prisma migration
- `pnpm db:seed` - add deterministic sample support data
- `pnpm db:studio` - open Prisma Studio
- `pnpm admin:bootstrap` - promote `BOOTSTRAP_ADMIN_EMAIL` to `SUPER_ADMIN`

## App Routes

- `/` - redirects to `/tickets`
- `/tickets` - main support inbox
- `/admin/users` - super-admin user and role management

## First Admin

After creating your first Clerk user and running migrations, set `BOOTSTRAP_ADMIN_EMAIL` in `.env` to that user's email address, then run:

```bash
pnpm admin:bootstrap
```

This creates or updates the matching app `User` row as `SUPER_ADMIN`.

Newly registered users are provisioned as `GUEST` by default. Guests only see an account-status message and Clerk account controls. A super-admin must promote them before they can access helpdesk features.
# SupperTime
