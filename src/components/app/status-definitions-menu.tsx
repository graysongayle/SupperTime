"use client";

import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TicketStatus } from "@/generated/prisma/enums";

const statusDefinitions = [
  {
    label: "Open",
    status: TicketStatus.OPEN,
    definition: "The support team owns the next action.",
  },
  {
    label: "Waiting on Other",
    status: TicketStatus.PENDING,
    definition: "Work is paused or blocked for an internal, timing, or unclear reason.",
  },
  {
    label: "Waiting on Customer",
    status: TicketStatus.WAITING_ON_CUSTOMER,
    definition: "The customer needs to reply or provide more information.",
  },
  {
    label: "Waiting on Third Party",
    status: TicketStatus.WAITING_ON_THIRD_PARTY,
    definition: "An outside provider, vendor, or dependency owns the next action.",
  },
  {
    label: "Resolved",
    status: TicketStatus.RESOLVED,
    definition: "The issue is solved, but the ticket has not been finalized.",
  },
  {
    label: "Closed",
    status: TicketStatus.CLOSED,
    definition: "The ticket is finalized and no further work is expected.",
  },
];

export function StatusDefinitionsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Show status definitions"
          className="size-7 text-muted-foreground"
        >
          <HelpCircle className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Status definitions</DropdownMenuLabel>
        <div className="space-y-3 px-2 py-2">
          {statusDefinitions.map((item) => (
            <div key={item.status} className="space-y-1">
              <div className="text-sm font-medium text-zinc-950">
                {item.label}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {item.definition}
              </p>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
