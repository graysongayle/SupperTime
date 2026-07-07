import { currentUser } from "@clerk/nextjs/server";

import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

function coerceDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

export async function getCurrentAppUser() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    return null;
  }

  const profileName = [clerkUser.firstName, clerkUser.lastName]
    .filter(Boolean)
    .join(" ");
  const name = (clerkUser.fullName ?? profileName) || email;
  const now = new Date();
  const clerkLastLoginAt = coerceDate(
    (clerkUser as { lastSignInAt?: unknown }).lastSignInAt,
  );

  return prisma.user.upsert({
    where: {
      clerkId: clerkUser.id,
    },
    create: {
      clerkId: clerkUser.id,
      email: email.toLowerCase(),
      name,
      role: UserRole.GUEST,
      lastLoginAt: clerkLastLoginAt ?? now,
      lastSeenAt: now,
    },
    update: {
      email: email.toLowerCase(),
      name,
      isActive: true,
      lastLoginAt: clerkLastLoginAt ?? undefined,
      lastSeenAt: now,
    },
  });
}

export async function requireSuperAdmin() {
  const appUser = await getCurrentAppUser();

  if (appUser?.role !== UserRole.SUPER_ADMIN) {
    return null;
  }

  return appUser;
}

export async function requireSupportFormManager() {
  const appUser = await getCurrentAppUser();

  if (
    appUser?.role !== UserRole.SUPER_ADMIN &&
    appUser?.role !== UserRole.MANAGER
  ) {
    return null;
  }

  return appUser;
}
