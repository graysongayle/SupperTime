import { notFound } from "next/navigation";
import Link from "next/link";
import { History, ShieldCheck, UsersRound } from "lucide-react";

import { updateUserRole } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { UserRole } from "@/generated/prisma/enums";
import { requireSuperAdmin } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const roleLabels = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.MANAGER]: "Manager",
  [UserRole.AGENT]: "Agent",
  [UserRole.GUEST]: "Guest",
};

const roleDescriptions = {
  [UserRole.SUPER_ADMIN]: "Full access, including user role management.",
  [UserRole.MANAGER]: "Can manage queues and assignments.",
  [UserRole.AGENT]: "Can work assigned support tickets.",
  [UserRole.GUEST]: "Can only view account status and manage their own Clerk account.",
};

const roleStyles = {
  [UserRole.SUPER_ADMIN]: "border-indigo-200 bg-indigo-50 text-indigo-800",
  [UserRole.MANAGER]: "border-cyan-200 bg-cyan-50 text-cyan-800",
  [UserRole.AGENT]: "border-zinc-200 bg-zinc-50 text-zinc-700",
  [UserRole.GUEST]: "border-amber-200 bg-amber-50 text-amber-800",
};

export default async function AdminUsersPage() {
  const actor = await requireSuperAdmin();

  if (!actor) {
    notFound();
  }

  const [users, activeSuperAdminCount] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clerkId: true,
        createdAt: true,
      },
    }),
    prisma.user.count({
      where: {
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      },
    }),
  ]);

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
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
            Users
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage internal app roles.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              App users
              <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-50 text-cyan-700 ring-1 ring-zinc-200">
                <UsersRound className="size-4" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-950">
              {users.length}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg border-zinc-200 bg-white shadow-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Super-admin rule</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The app must always keep at least one active super-admin. The server
            rejects any role change that would leave the system without one.
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clerk ID</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>History</TableHead>
                <TableHead className="text-right">Change role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isOnlySuperAdmin =
                  user.role === UserRole.SUPER_ADMIN &&
                  user.isActive &&
                  activeSuperAdminCount === 1;

                return (
                  <TableRow key={user.id} className="hover:bg-zinc-50/80">
                    <TableCell>
                      <div className="font-medium">{user.name ?? user.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleStyles[user.role]}>
                        {roleLabels[user.role]}
                      </Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {roleDescriptions[user.role]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          user.isActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600"
                        }
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                      {user.clerkId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/users/${user.id}/history`}>
                          <History className="size-4" />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={updateUserRole} className="flex justify-end gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          name="role"
                          defaultValue={user.role}
                          className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs"
                          aria-label={`Role for ${user.email}`}
                        >
                          <option
                            value={UserRole.GUEST}
                            disabled={isOnlySuperAdmin}
                          >
                            Guest
                          </option>
                          <option
                            value={UserRole.AGENT}
                            disabled={isOnlySuperAdmin}
                          >
                            Agent
                          </option>
                          <option
                            value={UserRole.MANAGER}
                            disabled={isOnlySuperAdmin}
                          >
                            Manager
                          </option>
                          <option value={UserRole.SUPER_ADMIN}>
                            Super Admin
                          </option>
                        </select>
                        <Button size="sm" type="submit">
                          Save
                        </Button>
                      </form>
                      {isOnlySuperAdmin ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Cannot be demoted until another super-admin exists.
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
