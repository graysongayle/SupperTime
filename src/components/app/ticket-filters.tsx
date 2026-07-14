"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, Save, Search } from "lucide-react";

import {
  clearTicketViewPreference,
  saveTicketViewPreference,
} from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import { toast } from "@/hooks/use-toast";

const defaultSort = "last_customer_desc";

const sortOptions = [
  {
    label: "Customer reply newest",
    value: "last_customer_desc",
  },
  {
    label: "Customer reply oldest",
    value: "last_customer_asc",
  },
  {
    label: "Agent reply newest",
    value: "last_agent_desc",
  },
  {
    label: "Agent reply oldest",
    value: "last_agent_asc",
  },
  {
    label: "Last update newest",
    value: "updated_desc",
  },
  {
    label: "Last update oldest",
    value: "updated_asc",
  },
  {
    label: "Created newest",
    value: "received_desc",
  },
  {
    label: "Created oldest",
    value: "received_asc",
  },
] as const;

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

type TicketFilterState = {
  assignees: string[];
  filterStatuses: TicketStatus[];
  includeClosed: boolean;
  priorities: TicketPriority[];
  q: string | null;
  sort: string;
  statuses: TicketStatus[];
  view: string | null;
};

type TicketFiltersProps = {
  active: TicketFilterState;
  agents: Array<{
    email: string;
    id: string;
    name: string | null;
  }>;
  hasFilters: boolean;
  hasSavedPreference: boolean;
};

type TicketSearchControlProps = {
  active: TicketFilterState;
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

function buildActiveSearchParams(active: TicketFilterState) {
  const params = new URLSearchParams();

  if (active.q) {
    params.set("q", active.q);
  }

  if (active.filterStatuses.length > 0) {
    params.set("status", active.filterStatuses.join(","));
  }

  if (active.priorities.length > 0) {
    params.set("priority", active.priorities.join(","));
  }

  if (active.assignees.length > 0) {
    params.set("assignee", active.assignees.join(","));
  }

  if (active.sort) {
    params.set("sort", active.sort);
  }

  if (active.view) {
    params.set("view", active.view);
  }

  if (active.includeClosed) {
    params.set("includeClosed", "true");
  }

  return params;
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
          className="h-9 min-w-0 justify-between bg-zinc-50 px-3 font-normal"
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
  hasSavedPreference,
}: TicketFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSavingPreference, startSavingPreference] = useTransition();

  function updateFilter(key: string, value: string) {
    const params = buildActiveSearchParams(active);
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
      router.replace(`${pathname}?${nextQuery}`);
    } else {
      router.replace(`${pathname}?sort=${defaultSort}`);
    }
  }

  function updateMultiFilter(key: string, values: string[]) {
    updateFilter(key, values.join(","));
  }

  function clearFilters() {
    router.replace(`${pathname}?sort=${defaultSort}&prefs=off`);
  }

  function buildPreferenceFormData() {
    const formData = new FormData();

    if (active.filterStatuses.length > 0) {
      formData.set("status", active.filterStatuses.join(","));
    }

    if (active.priorities.length > 0) {
      formData.set("priority", active.priorities.join(","));
    }

    if (active.assignees.length > 0) {
      formData.set("assignee", active.assignees.join(","));
    }

    if (active.sort) {
      formData.set("sort", active.sort);
    }

    if (active.view) {
      formData.set("view", active.view);
    }

    return formData;
  }

  function saveDefaultView() {
    startSavingPreference(async () => {
      try {
        const result = await saveTicketViewPreference(buildPreferenceFormData());

        toast({
          variant: "success",
          title: "Default saved",
          description: result.message,
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Save failed",
          description:
            error instanceof Error
              ? error.message
              : "The default view was not saved.",
        });
      }
    });
  }

  function clearDefaultView() {
    startSavingPreference(async () => {
      try {
        const formData = new FormData();

        if (active.view) {
          formData.set("view", active.view);
        }

        const result = await clearTicketViewPreference(formData);

        toast({
          variant: "success",
          title: "Default cleared",
          description: result.message,
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Clear failed",
          description:
            error instanceof Error
              ? error.message
              : "The saved default view was not cleared.",
        });
      }
    });
  }

  const assigneeDisabled = active.view === "mine" || active.view === "unassigned";
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
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <MultiSelectFilter
        label="Status"
        options={statusOptions}
        pluralLabel="Statuses"
        selectedValues={active.filterStatuses}
        onChange={(values) => updateMultiFilter("status", values)}
      />
      <MultiSelectFilter
        label="Priority"
        options={priorityOptions}
        pluralLabel="Priorities"
        selectedValues={active.priorities}
        onChange={(values) => updateMultiFilter("priority", values)}
      />
      <div
        className={
          assigneeDisabled ? "h-9 pointer-events-none opacity-50" : "h-9"
        }
      >
        <MultiSelectFilter
          label="Assignee"
          options={assigneeOptions}
          pluralLabel="Assignees"
          selectedValues={active.assignees}
          onChange={(values) => updateMultiFilter("assignee", values)}
        />
      </div>
      {hasFilters ? (
        <Button
          type="button"
          variant="outline"
          className="h-9 bg-white"
          onClick={clearFilters}
        >
          Clear
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="h-9 bg-white"
        disabled={isSavingPreference}
        onClick={saveDefaultView}
      >
        <Save className="size-4" />
        Save default
      </Button>
      {hasSavedPreference ? (
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={isSavingPreference}
          onClick={clearDefaultView}
        >
          <RotateCcw className="size-4" />
          Clear default
        </Button>
      ) : null}
      <Select
        value={active.sort}
        onValueChange={(value) => updateFilter("sort", value)}
      >
        <SelectTrigger className="h-9 min-w-0 bg-zinc-50 lg:ml-auto lg:w-[210px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TicketSearchControl({ active }: TicketSearchControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState(active.q ?? "");
  const queryChanged = query.trim() !== (active.q ?? "");

  useEffect(() => {
    setQuery(active.q ?? "");
  }, [active.q]);

  function submitSearch() {
    const params = buildActiveSearchParams(active);
    const trimmed = query.trim();

    params.delete("page");

    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }

    const nextQuery = params.toString();

    if (nextQuery) {
      router.replace(`${pathname}?${nextQuery}`);
    } else {
      router.replace(pathname);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-xl">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitSearch();
          }
        }}
        placeholder="Search subject, customer, or message"
        className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm shadow-xs"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 bg-white"
        disabled={!queryChanged}
        onClick={submitSearch}
        title="Search tickets"
        aria-label="Search tickets"
      >
        <Search className="size-4" />
      </Button>
    </div>
  );
}
