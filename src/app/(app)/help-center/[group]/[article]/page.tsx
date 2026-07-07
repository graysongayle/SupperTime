"use client"

import { PencilLine } from "lucide-react"

import { HelpCenterSidebar } from "@/components/app/help-center-sidebar"
import { useHelpCenterSelection } from "@/components/app/help-center-selection"

export default function HelpCenterArticlePage() {
  const { selection } = useHelpCenterSelection()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-background">
      <HelpCenterSidebar />
      <main className="min-w-0 flex-1 bg-[#f6f7f9] px-5 py-8 sm:px-10">
        <div className="mx-auto flex max-w-full flex-1 flex-col gap-6 lg:max-w-[56.76rem]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                  {selection.section.title}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
                  {selection.article.title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-zinc-600">
                  Placeholder edit route for this help center article. Replace
                  this shell with your editor or article detail view.
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900">
                <PencilLine className="size-5" />
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="space-y-4">
                <div className="h-4 w-32 rounded bg-zinc-100" />
                <div className="space-y-3">
                  <div className="h-10 rounded-lg border border-zinc-200 bg-zinc-50" />
                  <div className="h-40 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="space-y-4">
                <div className="text-sm font-semibold text-zinc-950">
                  Placeholder details
                </div>
                <div className="space-y-3 text-sm text-zinc-600">
                  <p>Section: {selection.section.title}</p>
                  <p>Article: {selection.article.title}</p>
                  <p>This route is ready for your future editor UI.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
