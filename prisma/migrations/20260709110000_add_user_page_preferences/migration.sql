CREATE TABLE "UserPagePreference" (
  "id" TEXT NOT NULL,
  "pageKey" TEXT NOT NULL,
  "preferences" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "UserPagePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserPagePreference_userId_pageKey_key"
ON "UserPagePreference"("userId", "pageKey");

CREATE INDEX "UserPagePreference_pageKey_idx"
ON "UserPagePreference"("pageKey");

ALTER TABLE "UserPagePreference"
ADD CONSTRAINT "UserPagePreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
