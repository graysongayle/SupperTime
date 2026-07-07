import {
  BookOpenText,
  Building2,
  CalendarDays,
  FileText,
  GraduationCap,
  MessageSquareText,
  Search,
  Settings,
  WalletCards,
  Workflow,
  UserRound,
  type LucideIcon,
} from "lucide-react"

export type HelpSubItem = {
  title: string
  href: string
  icon: LucideIcon
  description: string
}

export type HelpSection = {
  title: string
  icon: LucideIcon
  items: HelpSubItem[]
}

export const helpSections: HelpSection[] = [
  {
    title: "Get started",
    icon: BookOpenText,
    items: [
      {
        title: "Welcome to Cadence Calendar",
        href: "#welcome",
        icon: GraduationCap,
        description:
          "A polished getting-started overview of Cadence Calendar, the major areas, and the first tasks to complete.",
      },
      {
        title: "Import students",
        href: "#import-students",
        icon: Search,
        description:
          "This article explains the process of importing students into Cadence Calendar.",
      },
      {
        title: "Timezones: set, change, and defaults",
        href: "#timezones",
        icon: Workflow,
        description:
          "Learn how Cadence Calendar uses your saved timezone across the app.",
      },
      {
        title: "Search and create anything",
        href: "#search-create",
        icon: MessageSquareText,
        description: "Summary of the search and create workflow.",
      },
    ],
  },
  {
    title: "Students",
    icon: GraduationCap,
    items: [
      {
        title: "Add a new student",
        href: "#add-student",
        icon: UserRound,
        description: "This article explains how to add a new student.",
      },
      {
        title: "Change student status",
        href: "#student-status",
        icon: Building2,
        description:
          "In Cadence Calendar, student status helps you keep track of which students are active and which need attention.",
      },
      {
        title: "Delete a student",
        href: "#delete-student",
        icon: FileText,
        description: "This article explains how to delete a student.",
      },
    ],
  },
  {
    title: "Appointments",
    icon: CalendarDays,
    items: [
      {
        title: "Scheduling",
        href: "#scheduling",
        icon: CalendarDays,
        description: "Plan, move, and track appointments across your calendar.",
      },
      {
        title: "Availability",
        href: "#availability",
        icon: Workflow,
        description: "Manage open time and availability windows.",
      },
    ],
  },
  {
    title: "Lessons",
    icon: BookOpenText,
    items: [
      {
        title: "Lesson plans",
        href: "#lesson-plans",
        icon: FileText,
        description: "Create and organize lesson plan templates.",
      },
      {
        title: "Templates",
        href: "#lesson-templates",
        icon: WalletCards,
        description: "Reuse patterns for common lesson flows.",
      },
    ],
  },
  {
    title: "Groups",
    icon: Building2,
    items: [
      {
        title: "Group settings",
        href: "#group-settings",
        icon: Settings,
        description: "Update group level controls and defaults.",
      },
    ],
  },
  {
    title: "Subscriptions",
    icon: WalletCards,
    items: [
      {
        title: "Plans",
        href: "#plans",
        icon: WalletCards,
        description: "Review the available subscription plans.",
      },
      {
        title: "Billing",
        href: "#billing",
        icon: FileText,
        description: "Billing workflows, invoices, and subscription history.",
      },
    ],
  },
]

export const helpCenterDefaultBreadcrumb = {
  home: "Home",
  section: helpSections[0].title,
  article: helpSections[0].items[0].title,
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function getHelpCenterSectionSlug(section: HelpSection) {
  return slugify(section.title)
}

export function getHelpCenterArticleSlug(article: HelpSubItem) {
  return slugify(article.title)
}

export function getHelpCenterLocation(
  section: HelpSection,
  article: HelpSubItem,
) {
  return `/help-center?group=${getHelpCenterSectionSlug(section)}&article=${getHelpCenterArticleSlug(article)}`
}

export function getHelpCenterArticleLocation(
  section: HelpSection,
  article: HelpSubItem,
) {
  return `/help-center/${getHelpCenterSectionSlug(section)}/${getHelpCenterArticleSlug(article)}`
}

export function getHelpCenterSelectionFromPathname(pathname: string) {
  const path = pathname.replace(/^\/+|\/+$/g, "")
  const segments = path.split("/").filter(Boolean)

  if (segments[0] !== "help-center" || segments.length < 3) {
    return getHelpCenterSelection({})
  }

  const [, group, article] = segments

  return getHelpCenterSelection({
    group,
    article,
  })
}

export function getHelpCenterSelection({
  group,
  article,
}: {
  group?: string | null
  article?: string | null
}) {
  const selectedSection =
    helpSections.find((section) => getHelpCenterSectionSlug(section) === group) ??
    helpSections[0]

  const selectedArticle =
    selectedSection.items.find(
      (item) => getHelpCenterArticleSlug(item) === article,
    ) ?? selectedSection.items[0]

  return {
    article: selectedArticle,
    section: selectedSection,
  }
}
