import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function TicketNotFound() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-950">Ticket not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The ticket may have been deleted or the link may be incorrect.
      </p>
      <Button asChild className="mt-5">
        <Link href="/tickets">Back to tickets</Link>
      </Button>
    </div>
  );
}
