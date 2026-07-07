import Link from "next/link";
import { ArrowLeft, FileText, Flag, Plus, UserRound } from "lucide-react";

import { createTicket } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TicketPriority } from "@/generated/prisma/enums";

export default function NewTicketPage() {
  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/tickets">
              <ArrowLeft className="size-4" />
              Back to tickets
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
            Create ticket
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a manual customer request to the support queue.
          </p>
        </div>
      </div>

      <Card className="rounded-lg border-zinc-200 bg-white shadow-sm">
        <CardHeader className="border-b border-zinc-200">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-cyan-700" />
            Ticket details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form action={createTicket}>
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6 p-4 md:p-5">
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
                      <UserRound className="size-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-medium text-zinc-950">
                        Customer
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Identify who this request is for.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-medium">
                      Customer email
                      <Input
                        name="customerEmail"
                        type="email"
                        required
                        placeholder="customer@example.com"
                      />
                    </label>
                    <label className="space-y-1.5 text-sm font-medium">
                      Customer name
                      <Input
                        name="customerName"
                        placeholder="Customer or company"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3 border-t border-zinc-200 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200">
                      <FileText className="size-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-medium text-zinc-950">
                        Request
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Capture the issue as it should appear in the queue.
                      </p>
                    </div>
                  </div>

                  <label className="space-y-1.5 text-sm font-medium">
                    Subject
                    <Input
                      name="subject"
                      required
                      placeholder="Short description of the issue"
                    />
                  </label>

                  <label className="space-y-1.5 text-sm font-medium">
                    Internal description
                    <Textarea
                      name="description"
                      rows={9}
                      placeholder="Add context, reproduction steps, links, or notes for the support team."
                    />
                  </label>
                </section>
              </div>

              <aside className="border-t border-zinc-200 bg-zinc-50/70 p-4 lg:border-t-0 lg:border-l md:p-5">
                <div className="space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-white text-cyan-700 ring-1 ring-zinc-200">
                        <Flag className="size-4" />
                      </span>
                      <div>
                        <h2 className="text-sm font-medium text-zinc-950">
                          Triage
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Set the initial queue priority.
                        </p>
                      </div>
                    </div>

                    <label className="space-y-1.5 text-sm font-medium">
                      Priority
                      <select
                        name="priority"
                        defaultValue={TicketPriority.NORMAL}
                        className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm shadow-xs outline-none focus:border-cyan-600"
                      >
                        <option value={TicketPriority.LOW}>Low</option>
                        <option value={TicketPriority.NORMAL}>Normal</option>
                        <option value={TicketPriority.HIGH}>High</option>
                        <option value={TicketPriority.URGENT}>Urgent</option>
                      </select>
                    </label>
                  </section>

                  <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-muted-foreground">
                    Manual tickets are assigned to you initially and start as
                    open. Customer confirmation email is not sent for manual
                    internal intake.
                  </div>
                </div>
              </aside>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:justify-end md:px-5">
              <Button variant="outline" asChild>
                <Link href="/tickets">Cancel</Link>
              </Button>
              <Button
                type="submit"
                className="bg-zinc-900 text-white hover:bg-zinc-800"
              >
                <Plus className="size-4" />
                Create ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
