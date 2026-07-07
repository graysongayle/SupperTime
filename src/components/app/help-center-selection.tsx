"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  getHelpCenterArticleLocation,
  getHelpCenterSelection,
  getHelpCenterSelectionFromPathname,
  type HelpSection,
  type HelpSubItem,
} from "@/components/app/help-center-data"

type HelpCenterSelection = {
  section: HelpSection
  article: HelpSubItem
}

type HelpCenterSelectionContextValue = {
  selection: HelpCenterSelection
  setSelection: (section: HelpSection, article: HelpSubItem) => void
}

const HelpCenterSelectionContext =
  React.createContext<HelpCenterSelectionContextValue | null>(null)

function readSelectionFromLocation(pathname: string, search: string) {
  if (pathname.startsWith("/help-center/")) {
    return getHelpCenterSelectionFromPathname(pathname)
  }

  const params = new URLSearchParams(search)

  return getHelpCenterSelection({
    article: params.get("article"),
    group: params.get("group"),
  })
}

export function HelpCenterSelectionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [selection, setSelectionState] = React.useState(() =>
    getHelpCenterSelection({}),
  )

  React.useEffect(() => {
    const nextSelection = readSelectionFromLocation(
      pathname,
      window.location.search,
    )

    setSelectionState((current) =>
      current.section.title === nextSelection.section.title &&
      current.article.title === nextSelection.article.title
        ? current
        : nextSelection,
    )
  }, [pathname])

  const setSelection = React.useCallback(
    (section: HelpSection, article: HelpSubItem) => {
      setSelectionState({ section, article })

      if (typeof window === "undefined") {
        return
      }

      const nextUrl = getHelpCenterArticleLocation(section, article)
      const currentUrl = `${window.location.pathname}${window.location.search}`

      if (currentUrl !== nextUrl) {
        window.history.replaceState(window.history.state, "", nextUrl)
      }
    },
    [],
  )

  const value = React.useMemo(
    () => ({
      selection,
      setSelection,
    }),
    [selection, setSelection],
  )

  return (
    <HelpCenterSelectionContext.Provider value={value}>
      {children}
    </HelpCenterSelectionContext.Provider>
  )
}

export function useHelpCenterSelection() {
  const context = React.useContext(HelpCenterSelectionContext)

  if (!context) {
    throw new Error(
      "useHelpCenterSelection must be used within HelpCenterSelectionProvider",
    )
  }

  return context
}
