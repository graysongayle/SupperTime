"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
const unassignedAssigneeValue = "unassigned";

type TicketFiltersProps = {
  active: {
    assignees: string[];
    includeClosed: boolean;
    priorities: TicketPriority[];
    q: string | null;
    statuses: TicketStatus[];
    view: string | null;
  };
  agents: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  hasFilters: boolean;
};

type MultiSelectFilterProps<T extends string> = {
  label: string;
  options: Array<{
    label: string;
    value: T;
  }>;
  pluralLabel: string;
  selectedValues: T[];
  onChange: (values: T[]) => void;
};

function formatSelectedLabel(
  label: string,
  pluralLabel: string,
  selectedLabels: string[],
) {
  if (selectedLabels.length === 0) {
    return `Any ${label.toLowerCase()}`;
  }

  if (selectedLabels.length === 1) {
    return selectedLabels[0];
  }

  return `${selectedLabels.length} ${pluralLabel.toLowerCase()}`;
}

function MultiSelectFilter<T extends string>({
  label,
  onChange,
  options,
  pluralLabel,
  selectedValues,
}: MultiSelectFilterProps<T>) {
  const selectedSet = new Set(selectedValues);
  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);

  function toggleValue(value: T, checked: boolean) {
    const next = new Set(selectedValues);

    if (checked) {
      next.add(value);
    } else {
      next.delete(value);
    }

    onChange(Array.from(next));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 justify-between bg-zinc-50 px-3 font-normal"
        >
          <span className="min-w-0 truncate">
            {formatSelectedLabel(label, pluralLabel, selectedLabels)}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-zinc-950">{label}</div>
          <div className="flex flex-col gap-1">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.value)}
                  onChange={(event) =>
                    toggleValue(option.value, event.target.checked)
                  }
                  className="size-4"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {selectedValues.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => onChange([])}
            >
              Clear {label.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  function updateMultiFilter(key: string, values: string[]) {
    updateFilter(key, values.join(","));
  }

  function clearFilters() {
    setQuery("");
    window.localStorage.removeItem(storageKey);
    router.replace(pathname);
  }

  const assigneeDisabled = active.view === "mine" || active.view === "unassigned";
  const queryChanged = query.trim() !== (active.q ?? "");
  const statusOptions = Object.values(TicketStatus).map((status) => ({
    label: statusLabels[status],
    value: status,
  }));
  const priorityOptions = Object.values(TicketPriority).map((priority) => ({
    label: priorityLabels[priority],
    value: priority,
  }));
  const assigneeOptions = [
    {
      label: "Unassigned",
      value: unassignedAssigneeValue,
    },
    ...agents.map((agent) => ({
      label: agent.name ?? agent.email,
      value: agent.id,
    })),
  ];

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
      <MultiSelectFilter
        label="Status"
        options={statusOptions}
        pluralLabel="Statuses"
        selectedValues={active.statuses}
        onChange={(values) => updateMultiFilter("status", values)}
      />
      <MultiSelectFilter
        label="Priority"
        options={priorityOptions}
        pluralLabel="Priorities"
        selectedValues={active.priorities}
        onChange={(values) => updateMultiFilter("priority", values)}
      />
      <div className={assigneeDisabled ? "pointer-events-none opacity-50" : ""}>
        <MultiSelectFilter
          label="Assignee"
          options={assigneeOptions}
          pluralLabel="Assignees"
          selectedValues={active.assignees}
          onChange={(values) => updateMultiFilter("assignee", values)}
        />
      </div>
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
