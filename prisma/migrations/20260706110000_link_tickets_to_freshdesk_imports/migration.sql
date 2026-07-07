ALTER TABLE "Ticket" ADD COLUMN "freshdeskImportId" TEXT;

CREATE INDEX "Ticket_freshdeskImportId_idx" ON "Ticket"("freshdeskImportId");

ALTER TABLE "Ticket"
ADD CONSTRAINT "Ticket_freshdeskImportId_fkey"
FOREIGN KEY ("freshdeskImportId")
REFERENCES "FreshdeskImport"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
