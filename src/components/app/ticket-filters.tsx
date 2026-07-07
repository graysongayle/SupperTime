"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TicketPriority, TicketStatus } from "@/generated/prisma/enums";

const storageKey = "suppertime.ticketFilters";
const rememberedFilterKeys = [
  "q",
  "status",
  "priority",
  "assignee",
  "includeClosed",
];

const statusLabels = {
  [TicketStatus.OPEN]: "Open",
  [TicketStatus.PENDING]: "Waiting on Other",
  [TicketStatus.WAITING_ON_CUSTOMER]: "Waiting on Customer",
  [TicketStatus.WAITING_ON_THIRD_PARTY]: "Waiting on Third Party",
  [TicketStatus.RESOLVED]: "Resolved",
  [TicketStatus.CLOSED]: "Closed",
};

const priorityLabels = {
  [TicketPriority.LOW]: "Low",
  [TicketPriority.NORMAL]: "Normal",
  [TicketPriority.HIGH]: "High",
  [TicketPriority.URGENT]: "Urgent",
};

type TicketFiltersProps = {
  active: {
    assignee: string | null;
    includeClosed: boolean;
    priority: TicketPriority | null;
    q: string | null;
    status: TicketStatus | null;
    view: string | null;
  };
  agents: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  hasFilters: boolean;
};

export function TicketFilters({
  active,
  agents,
  hasFilters,
}: TicketFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(active.q ?? "");

  useEffect(() => {
    setQuery(active.q ?? "");
  }, [active.q]);

  useEffect(() => {
    const currentQuery = searchParams.toString();

    if (currentQuery) {
      rememberFilterQuery(searchParams);
      return;
    }

    window.localStorage.removeItem(storageKey);
  }, [pathname, router, searchParams]);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = value.trim();

    if (key === "assignee") {
      params.delete("view");
    }

    params.delete("page");

    if (trimmed) {
      params.set(key, trimmed);
    } else {
      params.delete(key);
    }

    const nextQuery = params.toString();

    if (nextQuery) {
      rememberFilterQuery(params);
      router.replace(`${pathname}?${nextQuery}`);
    } else {
      window.localStorage.removeItem(storageKey);
      router.replace(pathname);
    }
  }

  function clearFilters() {
    setQuery("");
    window.localStorage.removeItem(storageKey);
    router.replace(pathname);
  }

  const assigneeDisabled = active.view === "mine" || active.view === "unassigned";
  const queryChanged = query.trim() !== (active.q ?? "");

  return (
    <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            updateFilter("q", query);
          }
        }}
        placeholder="Search subject, customer, or message"
        className="h-9 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm shadow-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="bg-white"
        disabled={!queryChanged}
        onClick={() => updateFilter("q", query)}
        title="Search tickets"
        aria-label="Search tickets"
      >
        <Search className="size-4" />
      </Button>
      <select
        value={active.status ?? ""}
        onChange={(event) => updateFilter("status", event.target.value)}
        className="h-9 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm shadow-xs"
      >
        <option value="">Any status</option>
        {Object.values(TicketStatus).map((status) => (
          <option key={status} value={status}>
            {statusLabels[status]}
          </option>
        ))}
      </select>
      <select
        value={active.priority ?? ""}
        onChange={(event) => updateFilter("priority", event.target.value)}
        className="h-9 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm shadow-xs"
      >
        <option value="">Any priority</option>
        {Object.values(TicketPriority).map((priority) => (
          <option key={priority} value={priority}>
            {priorityLabels[priority]}
          </option>
        ))}
      </select>
      <select
        value={active.assignee ?? ""}
        onChange={(event) => updateFilter("assignee", event.target.value)}
        className="h-9 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm shadow-xs"
        disabled={assigneeDisabled}
      >
        <option value="">Any assignee</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name ?? agent.email}
          </option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700 shadow-xs">
        <input
          type="checkbox"
          checked={active.includeClosed}
          onChange={(event) =>
            updateFilter("includeClosed", event.target.checked ? "true" : "")
          }
          className="size-4"
        />
        <span className="whitespace-nowrap">Show closed tickets</span>
      </label>
      {hasFilters ? (
        <Button
          type="button"
          variant="outline"
          className="bg-white"
          onClick={clearFilters}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function rememberFilterQuery(params: URLSearchParams) {
  const remembered = new URLSearchParams();

  for (const key of rememberedFilterKeys) {
    const value = params.get(key);

    if (value) {
      remembered.set(key, value);
    }
  }

  const query = remembered.toString();

  if (query) {
    window.localStorage.setItem(storageKey, query);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}
