ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

UPDATE "User"
SET
  "lastLoginAt" = COALESCE("lastLoginAt", "updatedAt"),
  "lastSeenAt" = COALESCE("lastSeenAt", "updatedAt");
