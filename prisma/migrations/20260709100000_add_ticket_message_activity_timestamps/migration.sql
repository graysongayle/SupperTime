ALTER TABLE "Ticket"
ADD COLUMN "lastCustomerMessageAt" TIMESTAMP(3),
ADD COLUMN "lastAgentMessageAt" TIMESTAMP(3);

UPDATE "Ticket" t
SET "lastCustomerMessageAt" = latest."createdAt"
FROM (
  SELECT "ticketId", max("createdAt") AS "createdAt"
  FROM "TicketMessage"
  WHERE "authorType" = 'CUSTOMER'
    AND "visibility" = 'PUBLIC'
  GROUP BY "ticketId"
) latest
WHERE latest."ticketId" = t."id";

UPDATE "Ticket" t
SET "lastAgentMessageAt" = latest."createdAt"
FROM (
  SELECT "ticketId", max("createdAt") AS "createdAt"
  FROM "TicketMessage"
  WHERE "authorType" = 'AGENT'
    AND "visibility" = 'PUBLIC'
  GROUP BY "ticketId"
) latest
WHERE latest."ticketId" = t."id";

CREATE INDEX "Ticket_lastCustomerMessageAt_idx" ON "Ticket"("lastCustomerMessageAt");
CREATE INDEX "Ticket_lastAgentMessageAt_idx" ON "Ticket"("lastAgentMessageAt");
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");
