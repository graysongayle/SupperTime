import Link from "next/link";
import { Mail, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CustomerSearchParams = {
  page?: string;
  q?: string;
};

const pageSize = 50;

function buildHref(
  current: CustomerSearchParams,
  patch: Partial<CustomerSearchParams>,
) {
  const params = new URLSearchParams();
  const merged = {
    q: current.q,
    page: current.page,
    ...patch,
  };

  Object.entries(merged).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

function buildCustomerWhere(q: string | null): Prisma.CustomerWhereInput {
  if (!q) {
    return {};
  }

  return {
    OR: [
      {
        name: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: q,
          mode: "insensitive",
        },
      },
    ],
  };
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerSearchParams>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || null;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const where = buildCustomerWhere(q);
  const [customers, totalCustomers, customersWithTickets] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [
        {
          updatedAt: "desc",
        },
        {
          email: "asc",
        },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            tickets: true,
          },
        },
        tickets: {
          orderBy: {
            updatedAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            number: true,
            subject: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.customer.count({
      where,
    }),
    prisma.customer.count({
      where: {
        ...where,
        tickets: {
          some: {},
        },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const firstCustomerNumber =
    totalCustomers === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastCustomerNumber = Math.min(page * pageSize, totalCustomers);
  const previousPageHref = buildHref(params, {
    page: page > 2 ? String(page - 1) : undefined,
  });
  const nextPageHref = buildHref(params, {
    page: String(page + 1),
  });

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-cyan-200 bg-cyan-50 text-cyan-800"
            >
              Customer directory
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find customers and review their related support tickets.
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center justify-between text-sm">
              Matching customers
              <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-50 text-cyan-700 ring-1 ring-zinc-200">
                <UserRound className="size-4" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-950">
              {totalCustomers}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-lg border-zinc-200 bg-white shadow-sm md:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">With ticket history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-950">
              {customersWithTickets}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="p-3">
          <form action="/customers" className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search customers by name, email, or phone"
                className="h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 pl-8 text-sm shadow-xs"
              />
            </div>
            <Button type="submit" variant="outline" className="bg-white">
              Search
            </Button>
            {q ? (
              <Button asChild type="button" variant="ghost">
                <Link href="/customers">Clear</Link>
              </Button>
            ) : null}
          </form>
        </div>
        <div className="overflow-x-auto border-t border-zinc-200">
          <Table className="min-w-full table-fixed">
            <TableHeader className="bg-zinc-50">
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden w-[160px] md:table-cell">
                  Phone
                </TableHead>
                <TableHead className="w-[90px] text-right">Tickets</TableHead>
                <TableHead className="hidden w-[320px] lg:table-cell">
                  Latest ticket
                </TableHead>
                <TableHead className="w-[120px] text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const latestTicket = customer.tickets[0];

                return (
                  <TableRow key={customer.id} className="hover:bg-zinc-50/80">
                    <TableCell className="min-w-0 whitespace-normal">
                      <div className="min-w-0">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="break-words font-medium text-zinc-950 hover:underline [overflow-wrap:anywhere]"
                        >
                          {customer.name ?? customer.email}
                        </Link>
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3 shrink-0" />
                          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                            {customer.email}
                          </span>
                        </div>
                        {latestTicket ? (
                          <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere] lg:hidden">
                            Latest: #{latestTicket.number} {latestTicket.subject}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal break-words text-muted-foreground [overflow-wrap:anywhere] md:table-cell">
                      {customer.phone ?? "Not set"}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer._count.tickets}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal lg:table-cell">
                      {latestTicket ? (
                        <Link
                          href={`/tickets/${latestTicket.id}`}
                          className="line-clamp-2 break-words text-sm text-zinc-950 hover:underline [overflow-wrap:anywhere]"
                        >
                          #{latestTicket.number} {latestTicket.subject}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">No tickets</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                      {formatDate(customer.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-28 text-center text-muted-foreground"
                  >
                    No customers match the current search.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-3 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            {totalCustomers > 0
              ? `Showing ${firstCustomerNumber}-${lastCustomerNumber} of ${totalCustomers}`
              : "No customers to show"}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm" className="bg-white">
                <Link href={previousPageHref}>Previous</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            )}
            <span className="min-w-20 text-center text-xs">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm" className="bg-white">
                <Link href={nextPageHref}>Next</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
