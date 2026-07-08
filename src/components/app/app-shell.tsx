"use client";

import { ReactNode, useEffect, useState } from "react";
import { Inbox, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AppHeader } from "@/components/app/app-header";
import { AppNav } from "@/components/app/app-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  canManageSupportForms?: boolean;
  children: ReactNode;
  initials: string;
  isSuperAdmin: boolean;
  roleLabel: string;
  viewer: {
    appRole: string | null;
    clerkId: string | null;
    email: string;
    isActive: boolean | null;
    name: string;
  };
};

const sidebarStorageKey = "suppertime.sidebarCollapsed";

export function AppShell({
  canManageSupportForms = false,
  children,
  initials,
  isSuperAdmin,
  roleLabel,
  viewer,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(sidebarStorageKey) === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, String(next));
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9]">
      <div
        className={cn(
          "grid min-h-screen grid-cols-1 transition-[grid-template-columns] duration-200 lg:grid-cols-[260px_1fr]",
          collapsed && "lg:grid-cols-[76px_1fr]",
        )}
      >
        <aside className="hidden border-r border-zinc-200 bg-white/95 lg:block">
          <div
            className={cn(
              "flex h-16 items-center gap-3 border-b border-zinc-200 px-5",
              collapsed && "justify-center px-3",
            )}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm">
              <Inbox className="size-4" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">Suppertime</div>
                <div className="truncate text-xs text-muted-foreground">
                  Internal support
                </div>
              </div>
            ) : null}
          </div>
          <div className="border-b border-zinc-200 p-3">
            <Button
              type="button"
              variant="ghost"
              size={collapsed ? "icon" : "sm"}
              className={cn("w-full", !collapsed && "justify-start")}
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
              {!collapsed ? <span>Collapse</span> : null}
            </Button>
          </div>
          <AppNav
            canManageSupportForms={canManageSupportForms}
            collapsed={collapsed}
            isSuperAdmin={isSuperAdmin}
          />
        </aside>

        <section className="flex min-w-0 flex-col">
          <AppHeader />

          <div className="flex w-full flex-1 flex-col gap-5 p-4 md:p-6">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
