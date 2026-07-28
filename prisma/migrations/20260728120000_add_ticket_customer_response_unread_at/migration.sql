ALTER TABLE "Ticket"
ADD COLUMN "customerResponseUnreadAt" TIMESTAMP(3);

CREATE INDEX "Ticket_customerResponseUnreadAt_idx" ON "Ticket"("customerResponseUnreadAt");
