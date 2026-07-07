import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

loadDotEnv();

const required = ["DATABASE_URL", "CLERK_SECRET_KEY", "BOOTSTRAP_ADMIN_EMAIL"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
const clerkUser = await findClerkUserByEmail(adminEmail);

if (!clerkUser) {
  console.error(`No Clerk user found for ${adminEmail}.`);
  process.exit(1);
}

const primaryEmail =
  clerkUser.email_addresses?.find(
    (email) => email.id === clerkUser.primary_email_address_id
  )?.email_address ??
  clerkUser.email_addresses?.[0]?.email_address ??
  adminEmail;

const displayName =
  [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") ||
  clerkUser.username ||
  primaryEmail;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  const existing = await pool.query(
    'select "id" from "User" where "clerkId" = $1 or lower("email") = lower($2) limit 1',
    [clerkUser.id, primaryEmail]
  );

  const userId = existing.rows[0]?.id ?? randomUUID();

  const result = await pool.query(
    `
      insert into "User" ("id", "clerkId", "email", "name", "role", "isActive", "createdAt", "updatedAt")
      values ($1, $2, $3, $4, 'SUPER_ADMIN'::"UserRole", true, now(), now())
      on conflict ("id") do update set
        "clerkId" = excluded."clerkId",
        "email" = excluded."email",
        "name" = excluded."name",
        "role" = 'SUPER_ADMIN'::"UserRole",
        "isActive" = true,
        "updatedAt" = now()
      returning "id", "email", "name", "role"
    `,
    [userId, clerkUser.id, primaryEmail.toLowerCase(), displayName]
  );

  const user = result.rows[0];
  console.log(`Bootstrapped ${user.email} as ${user.role}.`);
} finally {
  await pool.end();
}

async function findClerkUserByEmail(email) {
  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("email_address", email);
  url.searchParams.set("limit", "10");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Clerk user lookup failed: ${response.status} ${body}`);
  }

  const users = await response.json();
  return users.find((user) =>
    user.email_addresses?.some(
      (candidate) => candidate.email_address?.toLowerCase() === email
    )
  );
}

function loadDotEnv() {
  let contents;

  try {
    contents = readFileSync(".env", "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}
