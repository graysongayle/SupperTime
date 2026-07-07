ALTER TABLE "Ticket" ADD COLUMN "emailReplyToken" TEXT;

CREATE UNIQUE INDEX "Ticket_emailReplyToken_key" ON "Ticket"("emailReplyToken");
