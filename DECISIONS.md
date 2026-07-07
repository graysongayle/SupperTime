# Decisions

## 2026-06-04: Use pnpm

Use pnpm as the package manager for faster installs, stricter dependency resolution, and good compatibility with modern Next.js projects.

## 2026-06-04: Use Prisma 7 Generated Client Output

Prisma is configured to generate the client into `src/generated/prisma`, matching the Prisma 7 default scaffold and keeping generated database code explicit.

## 2026-06-04: Reserve Public Support Routes

Clerk middleware protects internal routes by default. `/support`, `/api/support-form`, and `/api/inbound-email` are reserved as public customer or webhook entry points.
