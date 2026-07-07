UPDATE "Ticket"
SET "status" = 'OPEN'
WHERE "status" = 'NEW';

UPDATE "TicketStatusHistory"
SET "from" = 'OPEN'
WHERE "from" = 'NEW';

UPDATE "TicketStatusHistory"
SET "to" = 'OPEN'
WHERE "to" = 'NEW';

ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";

CREATE TYPE "TicketStatus" AS ENUM (
  'OPEN',
  'PENDING',
  'WAITING_ON_CUSTOMER',
  'WAITING_ON_THIRD_PARTY',
  'RESOLVED',
  'CLOSED'
);

ALTER TABLE "Ticket"
ALTER COLUMN "status" TYPE "TicketStatus"
USING "status"::text::"TicketStatus";

ALTER TABLE "TicketStatusHistory"
ALTER COLUMN "from" TYPE "TicketStatus"
USING "from"::text::"TicketStatus";

ALTER TABLE "TicketStatusHistory"
ALTER COLUMN "to" TYPE "TicketStatus"
USING "to"::text::"TicketStatus";

ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'OPEN';

DROP TYPE "TicketStatus_old";
