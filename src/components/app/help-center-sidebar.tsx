"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import * as React from "react";

import {
  getHelpCenterArticleLocation,
  helpSections,
  type HelpSection,
} from "@/components/app/help-center-data";
import { useHelpCenterSelection } from "@/components/app/help-center-selection";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function ActionPopover({
  ariaLabel,
  scope,
  triggerClassName,
}: {
  ariaLabel: string;
  scope: "help-section" | "subitem";
  triggerClassName: string;
}) {
  const hoverClass =
    scope === "help-section"
      ? "group-hover/help-section:pointer-events-auto group-hover/help-section:opacity-100"
      : "group-hover/subitem:pointer-events-auto group-hover/subitem:opacity-100";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "pointer-events-none absolute flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 opacity-0 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            hoverClass,
            triggerClassName,
          )}
        >
          <Ellipsis className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-32 border-sidebar-border bg-sidebar p-1 text-sidebar-foreground shadow-lg"
      >
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left text-sm transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PencilLine className="size-4" />
          Edit
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left text-sm transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Trash2 className="size-4" />
          Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

function HelpCenterSection({
  section,
  isOpen,
  onToggle,
}: {
  section: HelpSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { setSelection } = useHelpCenterSelection();

  return (
    <SidebarMenuItem className="group/help-section relative">
      <div className="relative">
        <SidebarMenuButton
          asChild
          className="w-full justify-start rounded-lg px-3 py-2 pr-24 text-left text-sm font-medium text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <button
            type="button"
            onClick={() => onToggle()}
            className="flex w-full items-center gap-2"
          >
            <section.icon className="size-4 shrink-0" />
            <span className="truncate">{section.title}</span>
          </button>
        </SidebarMenuButton>

        <ActionPopover
          ariaLabel={`Actions for ${section.title}`}
          scope="help-section"
          triggerClassName="right-10 top-1/2 -translate-y-1/2"
        />

        <button
          type="button"
          aria-label={isOpen ? "Collapse section" : "Expand section"}
          onClick={onToggle}
          className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {isOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      </div>

      {isOpen ? (
        <SidebarMenuSub className="mt-1">
          {section.items.map((item) => (
            <SidebarMenuSubItem key={item.title} className="group/subitem">
              <div className="relative">
                <SidebarMenuSubButton asChild className="w-full pr-8">
                  <Link
                    href={getHelpCenterArticleLocation(section, item)}
                    onClick={() => setSelection(section, item)}
                    onFocus={() => setSelection(section, item)}
                    className="flex w-full items-center gap-2"
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                </SidebarMenuSubButton>

                <ActionPopover
                  ariaLabel={`Actions for ${item.title}`}
                  scope="subitem"
                  triggerClassName="right-0 top-1/2 -translate-y-1/2"
                />
              </div>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
}

export function HelpCenterSidebar() {
  const { selection } = useHelpCenterSelection();
  const [openSections, setOpenSections] = React.useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      helpSections.map((section, index) => [section.title, index === 0]),
    ),
  );

  return (
    <aside className="sticky top-16 h-[calc(100dvh-4rem)] w-[320px] shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
        <div>
          <div className="text-base font-semibold tracking-tight">
            Help Center
          </div>
          <div className="mt-0.5 text-xs text-sidebar-foreground/60">
            Mock structure
          </div>
        </div>
        <button
          type="button"
          aria-label="Open help center in a new tab"
          className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <ExternalLink className="size-4" />
        </button>
      </div>

      <div className="no-scrollbar h-[calc(100%-4.5rem)] overflow-auto px-2 py-3">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {helpSections.map((section) => (
                <HelpCenterSection
                  key={section.title}
                  section={section}
                  isOpen={
                    Boolean(openSections[section.title]) ||
                    selection.section.title === section.title
                  }
                  onToggle={() =>
                    setOpenSections((current) => ({
                      ...current,
                      [section.title]: !current[section.title],
                    }))
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <button
          type="button"
          className="mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Plus className="size-4" />
          New group
        </button>
      </div>
    </aside>
  );
}
