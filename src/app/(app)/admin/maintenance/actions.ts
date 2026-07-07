"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value;
}

function isDangerousResetEnabled() {
  return process.env.ENABLE_DANGEROUS_ADMIN_RESET === "true";
}

export async function deleteFreshdeskImportTickets(formData: FormData) {
  const actor = await requireSuperAdmin();

  if (!actor) {
    throw new Error("Only super-admins can delete imported tickets.");
  }

  const importId = requiredString(formData, "importId");
  const confirmation = requiredString(formData, "confirmation");
  const importRun = await prisma.freshdeskImport.findUnique({
    where: {
      id: importId,
    },
    include: {
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  if (!importRun) {
    throw new Error("Import run not found.");
  }

  const expectedConfirmation = `DELETE IMPORT ${importRun.id}`;

  if (confirmation !== expectedConfirmation) {
    throw new Error(`Type ${expectedConfirmation} to delete this import run.`);
  }

  const deleted = await prisma.ticket.deleteMany({
    where: {
      freshdeskImportId: importRun.id,
    },
  });

  await prisma.freshdeskImport.update({
    where: {
      id: importRun.id,
    },
    data: {
      completedAt: importRun.completedAt ?? new Date(),
      errorSummary: {
        cleanup: {
          deletedBy: actor.id,
          deletedTickets: deleted.count,
          deletedAt: new Date().toISOString(),
        },
      },
    },
  });

  console.info("[admin-maintenance] deleted Freshdesk import tickets", {
    actorId: actor.id,
    deletedTickets: deleted.count,
    importId: importRun.id,
    sourceFile: importRun.sourceFile,
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/tickets");

  return {
    ok: true,
    message: `Deleted ${deleted.count} ticket${deleted.count === 1 ? "" : "s"} from import ${importRun.sourceFile}.`,
  };
}

export async function deleteAllTicketsForDevelopment(formData: FormData) {
  const actor = await requireSuperAdmin();

  if (!actor) {
    throw new Error("Only super-admins can delete all tickets.");
  }

  if (!isDangerousResetEnabled()) {
    throw new Error("Dangerous admin reset is not enabled.");
  }

  const confirmation = requiredString(formData, "confirmation");

  if (confirmation !== "DELETE ALL TICKETS") {
    throw new Error("Type DELETE ALL TICKETS to run this reset.");
  }

  const deletedTickets = await prisma.ticket.deleteMany();
  const deletedImports = await prisma.freshdeskImport.deleteMany();

  console.warn("[admin-maintenance] deleted all tickets", {
    actorId: actor.id,
    deletedImports: deletedImports.count,
    deletedTickets: deletedTickets.count,
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/tickets");

  return {
    ok: true,
    message: `Deleted ${deletedTickets.count} ticket${deletedTickets.count === 1 ? "" : "s"} and ${deletedImports.count} import run${deletedImports.count === 1 ? "" : "s"}.`,
  };
}
