CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CannedResponse_userId_title_key" ON "CannedResponse"("userId", "title");
CREATE INDEX "CannedResponse_userId_sortOrder_idx" ON "CannedResponse"("userId", "sortOrder");
CREATE INDEX "CannedResponse_userId_title_idx" ON "CannedResponse"("userId", "title");

ALTER TABLE "CannedResponse" ADD CONSTRAINT "CannedResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
