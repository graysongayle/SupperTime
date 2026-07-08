import { NextRequest, NextResponse } from "next/server";

import { UserRole } from "@/generated/prisma/enums";
import { getAttachmentDownloadUrl } from "@/lib/attachments";
import { getCurrentAppUser } from "@/lib/current-app-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ attachmentId: string }>;
  },
) {
  const viewer = await getCurrentAppUser();

  if (!viewer || !viewer.isActive || viewer.role === UserRole.GUEST) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: {
      id: attachmentId,
    },
    select: {
      contentType: true,
      fileName: true,
      storageKey: true,
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  if (!attachment.contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Attachment is not an image." }, { status: 400 });
  }

  const url = await getAttachmentDownloadUrl({
    ...attachment,
    disposition: "inline",
  });

  return NextResponse.redirect(url);
}
