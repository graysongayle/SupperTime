import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: string;
};

const prismaSchemaVersion = "20260706110000_support_article_nullable_fields";

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (!databaseUrl) {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");

  if (
    sslMode === "prefer" ||
    sslMode === "require" ||
    sslMode === "verify-ca"
  ) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});

export const prisma =
  globalForPrisma.prismaSchemaVersion === prismaSchemaVersion &&
  globalForPrisma.prisma
    ? globalForPrisma.prisma
    : new PrismaClient({
        adapter,
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
}
