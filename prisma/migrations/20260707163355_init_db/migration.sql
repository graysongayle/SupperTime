-- CreateTable
CREATE TABLE "SupportArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT,
    "summary" TEXT,
    "content" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportArticle_slug_key" ON "SupportArticle"("slug");

-- CreateIndex
CREATE INDEX "SupportArticle_isPublished_publishedAt_idx" ON "SupportArticle"("isPublished", "publishedAt");
