CREATE TABLE "SupportForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Contact support',
    "intro" TEXT NOT NULL DEFAULT 'Send a message to our support team.',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Support',
    "accentColor" TEXT NOT NULL DEFAULT '#0f766e',
    "placement" TEXT NOT NULL DEFAULT 'bottom-right',
    "successMessage" TEXT NOT NULL DEFAULT 'Thanks. We received your request.',
    "turnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "turnstileSiteKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportForm_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Ticket" ADD COLUMN "supportFormId" TEXT;

CREATE INDEX "Ticket_supportFormId_idx" ON "Ticket"("supportFormId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_supportFormId_fkey" FOREIGN KEY ("supportFormId") REFERENCES "SupportForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
