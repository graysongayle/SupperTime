CREATE TYPE "TicketParticipantRole" AS ENUM ('REQUESTER', 'TO', 'CC', 'OTHER');

CREATE TABLE "TicketParticipant" (
    "id" TEXT NOT NULL,
    "role" "TicketParticipantRole" NOT NULL DEFAULT 'OTHER',
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ticketId" TEXT NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "TicketParticipant_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TicketParticipant" (
    "id",
    "role",
    "email",
    "name",
    "createdAt",
    "updatedAt",
    "ticketId",
    "customerId"
)
SELECT
    'tp_' || md5(t."id" || ':' || c."email"),
    'REQUESTER'::"TicketParticipantRole",
    c."email",
    c."name",
    now(),
    now(),
    t."id",
    c."id"
FROM "Ticket" t
JOIN "Customer" c ON c."id" = t."customerId"
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "TicketParticipant_ticketId_email_key" ON "TicketParticipant"("ticketId", "email");

CREATE INDEX "TicketParticipant_email_idx" ON "TicketParticipant"("email");

ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
