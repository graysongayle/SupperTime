"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

type AppContentShellProps = {
  children: React.ReactNode
}

export function AppContentShell({ children }: AppContentShellProps) {
  const pathname = usePathname()
  const isHelpCenter = pathname.startsWith("/help-center")

  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col",
        isHelpCenter
          ? "p-0"
          : "mx-auto max-w-7xl gap-5 p-4 md:p-6",
      )}
    >
      {children}
    </div>
  )
}
