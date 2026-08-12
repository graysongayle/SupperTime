import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CannedResponseManager } from "@/components/app/canned-response-manager";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/generated/prisma/enums";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TicketTemplatesPage() {
  const viewer = await getCurrentAppUser();

  if (!viewer || !viewer.isActive || viewer.role === UserRole.GUEST) {
    notFound();
  }

  const templates = await prisma.cannedResponse.findMany({
    where: {
      userId: viewer.id,
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        title: "asc",
      },
    ],
    select: {
      id: true,
      title: true,
      body: true,
      bodyHtml: true,
    },
  });

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/tickets">
              <ArrowLeft className="size-4" />
              Back to tickets
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
            Response templates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your reusable replies for ticket conversations.
          </p>
        </div>
      </div>

      <CannedResponseManager templates={templates} />
    </>
  );
}
