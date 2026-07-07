import { notFound } from "next/navigation";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import {
  deleteAllTicketsForDevelopment,
  deleteFreshdeskImportTickets,
} from "@/app/(app)/admin/maintenance/actions";
import { MaintenanceDeleteForm } from "@/components/app/maintenance-delete-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null) {
  if (!date) {
    return "Not completed";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isDangerousResetEnabled() {
  return process.env.ENABLE_DANGEROUS_ADMIN_RESET === "true";
}

export default async function AdminMaintenancePage() {
  const actor = await requireSuperAdmin();

  if (!actor) {
    notFound();
  }

  const [imports, totalTickets] = await Promise.all([
    prisma.freshdeskImport.findMany({
      orderBy: {
        startedAt: "desc",
      },
      include: {
        _count: {
          select: {
            tickets: true,
          },
        },
      },
      take: 50,
    }),
    prisma.ticket.count(),
  ]);
  const resetEnabled = isDangerousResetEnabled();

  return (
    <>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-indigo-200 bg-indigo-50 text-indigo-800"
          >
            <ShieldCheck className="size-3" />
            Super-admin only
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
          Maintenance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cleanup tools for import testing and controlled destructive actions.
        </p>
      </div>

      <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseZap className="size-4 text-cyan-700" />
            Freshdesk import cleanup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-muted-foreground">
            Prefer deleting tickets by import run while testing imports. This
            removes only tickets attached to that run and leaves users,
            customers, and tags in place.
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <Table>
              <TableHeader className="bg-zinc-50">
                <TableRow>
                  <TableHead>Import</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="w-[320px]">Cleanup</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((importRun) => (
                  <TableRow key={importRun.id}>
                    <TableCell>
                      <div className="font-medium text-zinc-950">
                        {importRun.sourceFile}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {importRun.id}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(importRun.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(importRun.completedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {importRun._count.tickets}
                    </TableCell>
                    <TableCell>
                      {importRun._count.tickets > 0 ? (
                        <MaintenanceDeleteForm
                          action={deleteFreshdeskImportTickets}
                          confirmation={`DELETE IMPORT ${importRun.id}`}
                          description={`Delete ${importRun._count.tickets} ticket${
                            importRun._count.tickets === 1 ? "" : "s"
                          } imported from ${importRun.sourceFile}.`}
                          hiddenFields={{
                            importId: importRun.id,
                          }}
                          title="Delete tickets from this import?"
                          triggerLabel="Delete imported tickets"
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No tickets attached.
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {imports.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No import runs yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-red-200 bg-red-50/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-red-950">
            Development reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-900">
            This deletes all tickets and import runs. It is intended only for
            local or disposable import testing environments.
          </p>
          {resetEnabled ? (
            <MaintenanceDeleteForm
              action={deleteAllTicketsForDevelopment}
              confirmation="DELETE ALL TICKETS"
              description={`Delete all ${totalTickets} ticket${
                totalTickets === 1 ? "" : "s"
              } and all Freshdesk import runs.`}
              title="Delete all tickets?"
              triggerLabel="Delete all tickets"
            />
          ) : (
            <div className="rounded-lg border border-red-200 bg-white p-3 text-sm text-red-950">
              Disabled. Set{" "}
              <code className="rounded bg-red-100 px-1 py-0.5">
                ENABLE_DANGEROUS_ADMIN_RESET=true
              </code>{" "}
              to expose this action.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
