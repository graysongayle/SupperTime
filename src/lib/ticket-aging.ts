import {
  TicketStatus,
  type TicketStatus as TicketStatusValue,
} from "@/generated/prisma/enums";

type AgingInput = {
  createdAt: Date | string;
  hasAgentReply?: boolean;
  latestAgentMessageAt: Date | string | null;
  latestCustomerMessageAt: Date | string | null;
  status: TicketStatusValue;
};

type AgingSeverity = "neutral" | "warning" | "danger";

type AgingState = {
  ageLabel: string;
  label: string;
  severity: AgingSeverity;
} | null;

const waitingStatuses = new Set<TicketStatusValue>([
  TicketStatus.WAITING_ON_CUSTOMER,
  TicketStatus.WAITING_ON_THIRD_PARTY,
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
]);

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function formatAge(from: Date) {
  const diffMinutes = Math.max(
    1,
    Math.floor((Date.now() - from.getTime()) / 60000),
  );

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 48) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

function getSeverity(from: Date): AgingSeverity {
  const diffHours = (Date.now() - from.getTime()) / 3600000;

  if (diffHours >= 24) {
    return "danger";
  }

  if (diffHours >= 8) {
    return "warning";
  }

  return "neutral";
}

export function getTicketAgingState({
  createdAt,
  hasAgentReply,
  latestAgentMessageAt,
  latestCustomerMessageAt,
  status,
}: AgingInput): AgingState {
  if (waitingStatuses.has(status)) {
    return null;
  }

  const created = toDate(createdAt) ?? new Date();
  const latestAgent = toDate(latestAgentMessageAt);
  const latestCustomer = toDate(latestCustomerMessageAt);

  if (!latestAgent && !hasAgentReply) {
    return {
      ageLabel: formatAge(latestCustomer ?? created),
      label: "No agent reply",
      severity: getSeverity(latestCustomer ?? created),
    };
  }

  if (latestCustomer && (!latestAgent || latestCustomer > latestAgent)) {
    return {
      ageLabel: formatAge(latestCustomer),
      label: "Customer waiting",
      severity: getSeverity(latestCustomer),
    };
  }

  return null;
}

export function getTicketAgingClass(severity: AgingSeverity) {
  if (severity === "danger") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}
