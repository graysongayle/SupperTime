"use server";

import { revalidatePath } from "next/cache";

import { UserRole, type UserRole as UserRoleValue } from "@/generated/prisma/enums";
import { requireSuperAdmin } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

const validRoles = new Set<UserRoleValue>([
  UserRole.SUPER_ADMIN,
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.GUEST,
]);

export async function updateUserRole(formData: FormData) {
  const actor = await requireSuperAdmin();

  if (!actor) {
    throw new Error("Only super-admins can update user roles.");
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as UserRoleValue;

  if (!userId || !validRoles.has(role)) {
    throw new Error("Invalid role update request.");
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!target) {
      throw new Error("User not found.");
    }

    if (target.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
      const remainingSuperAdmins = await tx.user.count({
        where: {
          role: UserRole.SUPER_ADMIN,
          isActive: true,
          id: {
            not: target.id,
          },
        },
      });

      if (remainingSuperAdmins === 0) {
        throw new Error("At least one active super-admin is required.");
      }
    }

    await tx.user.update({
      where: {
        id: target.id,
      },
      data: {
        role,
      },
    });
  });

  revalidatePath("/admin/users");
  revalidatePath("/tickets");
}
