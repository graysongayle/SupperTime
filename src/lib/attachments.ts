import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  formatAttachmentLimit,
  maxAttachmentBytes,
  maxAttachmentCount,
} from "@/lib/attachment-limits";

export type PendingAttachment = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

export type StoredAttachment = {
  contentType: string;
  fileName: string;
  sizeBytes: number;
  storageKey: string;
};

const dangerousExtensions = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".js",
  ".jse",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".vbs",
  ".wsf",
]);

let s3Client: S3Client | null = null;

function getBucketName() {
  const bucket = process.env.ATTACHMENT_STORAGE_BUCKET?.trim();

  if (!bucket) {
    throw new Error("ATTACHMENT_STORAGE_BUCKET is not configured.");
  }

  return bucket;
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION?.trim() || "us-east-1",
    });
  }

  return s3Client;
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized || "attachment";
}

function getExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function assertAllowedAttachment(fileName: string, sizeBytes: number) {
  if (sizeBytes <= 0) {
    throw new Error(`${fileName} is empty.`);
  }

  if (dangerousExtensions.has(getExtension(fileName))) {
    throw new Error(`${fileName} uses a blocked file type.`);
  }
}

export function assertAttachmentBatchLimits(attachments: PendingAttachment[]) {
  if (attachments.length > maxAttachmentCount) {
    throw new Error(`Attach up to ${maxAttachmentCount} files per message.`);
  }

  const totalBytes = attachments.reduce(
    (total, attachment) => total + attachment.sizeBytes,
    0,
  );

  if (totalBytes > maxAttachmentBytes) {
    throw new Error(
      `Attachments must be ${formatAttachmentLimit()} or less per message.`,
    );
  }

  for (const attachment of attachments) {
    assertAllowedAttachment(attachment.fileName, attachment.sizeBytes);
  }
}

export async function formDataFilesToPendingAttachments(
  files: FormDataEntryValue[],
) {
  const attachments = await Promise.all(
    files
      .filter((value): value is File => value instanceof File && value.size > 0)
      .map(async (file) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        fileName: sanitizeFileName(file.name),
        sizeBytes: file.size,
      })),
  );

  assertAttachmentBatchLimits(attachments);

  return attachments;
}

export async function uploadTicketAttachments({
  attachments,
  messageId,
  ticketId,
}: {
  attachments: PendingAttachment[];
  messageId: string;
  ticketId: string;
}) {
  assertAttachmentBatchLimits(attachments);

  const stored: StoredAttachment[] = [];

  for (const attachment of attachments) {
    const storageKey = [
      "tickets",
      ticketId,
      "messages",
      messageId,
      `${randomUUID()}-${attachment.fileName}`,
    ].join("/");

    await getS3Client().send(
      new PutObjectCommand({
        Body: attachment.buffer,
        Bucket: getBucketName(),
        ContentLength: attachment.sizeBytes,
        ContentType: attachment.contentType,
        Key: storageKey,
      }),
    );

    stored.push({
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      storageKey,
    });
  }

  return stored;
}

export async function deleteStoredAttachments(storageKeys: string[]) {
  await Promise.all(
    storageKeys.map((storageKey) =>
      getS3Client().send(
        new DeleteObjectCommand({
          Bucket: getBucketName(),
          Key: storageKey,
        }),
      ),
    ),
  );
}

export async function getAttachmentDownloadUrl({
  contentType,
  disposition = "attachment",
  fileName,
  storageKey,
}: {
  contentType: string;
  disposition?: "attachment" | "inline";
  fileName: string;
  storageKey: string;
}) {
  const safeFileName = sanitizeFileName(fileName).replace(/"/g, "");

  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: storageKey,
      ResponseContentDisposition: `${disposition}; filename="${safeFileName}"`,
      ResponseContentType: contentType,
    }),
    {
      expiresIn: 60,
    },
  );
}

export function pendingAttachmentsToPostmarkAttachments(
  attachments: PendingAttachment[],
) {
  return attachments.map((attachment) => ({
    Content: attachment.buffer.toString("base64"),
    ContentType: attachment.contentType,
    Name: attachment.fileName,
  }));
}
