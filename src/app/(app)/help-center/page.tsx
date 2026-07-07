"use client"

import Link from "next/link"
import { EyeOff } from "lucide-react"

import {
  getHelpCenterArticleLocation,
  helpSections,
} from "@/components/app/help-center-data"
import { HelpCenterSidebar } from "@/components/app/help-center-sidebar"
import { useHelpCenterSelection } from "@/components/app/help-center-selection"

export default function HelpCenterPage() {
  const { selection, setSelection } = useHelpCenterSelection()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-background">
      <HelpCenterSidebar />
      <main className="min-w-0 flex-1 bg-[#f6f7f9]">
        <div className="mx-auto flex max-w-full flex-1 flex-col gap-10 px-5 py-8 sm:px-10 lg:max-w-[56.76rem]">
          <h1 className="mb-5 text-[2rem] font-semibold leading-[1.15] tracking-tight">
            <span className="text-primary">Good evening.</span>
            <span className="block text-gray-500 sm:ml-[0.25em] sm:inline dark:text-gray-400">
              How can I help?
            </span>
          </h1>
          {helpSections.map((section) => (
            <section key={section.title} className="space-y-4">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">
                {section.title}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map((article) => {
                  const isSelected =
                    selection.section.title === section.title &&
                    selection.article.title === article.title

                  return (
                    <Link
                      key={article.title}
                      href={getHelpCenterArticleLocation(section, article)}
                      onClick={() => setSelection(section, article)}
                      onFocus={() => setSelection(section, article)}
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "group relative flex cursor-default flex-col flex-wrap overflow-hidden rounded-lg bg-black/[0.02] px-3 py-5 ring-1 ring-zinc-300 transition-colors hover:bg-gray-100 lg:px-[1.2rem] dark:bg-gray-850 dark:shadow-black dark:ring-white/10 dark:hover:bg-gray-800"
                          : "group relative flex cursor-default flex-col flex-wrap overflow-hidden rounded-lg bg-black/[0.02] px-3 py-5 ring-1 ring-black/15 transition-colors hover:bg-gray-100 lg:px-[1.2rem] dark:bg-gray-850 dark:shadow-black dark:ring-white/10 dark:hover:bg-gray-800"
                      }
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--portal-accent-color)] to-transparent opacity-[0.00]"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--portal-accent-color) 0%, transparent 100%)",
                        }}
                      />
                      <div className="relative">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex h-6 w-6 items-center justify-center overflow-hidden">
                            <article.icon className="size-5 min-h-5 min-w-5 text-primary" />
                          </div>
                          <div className="-mr-1 -mt-1">
                            <button
                              type="button"
                              aria-label="Hide from home"
                              className="flex h-6 w-6 items-center justify-center rounded text-gray-500 opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 dark:text-gray-400 dark:hover:text-primary"
                            >
                              <EyeOff className="size-4" />
                            </button>
                          </div>
                        </div>
                        <h3 className="mt-4 line-clamp-1 min-w-0 text-ellipsis text-[0.9rem] font-medium tracking-tight text-primary sm:mt-10">
                          {article.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 min-w-0 overflow-hidden text-ellipsis text-[0.8rem] tracking-tight text-gray-500 opacity-90 dark:text-gray-400">
                          {article.description}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
