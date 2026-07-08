export const maxAttachmentCount = 5;
export const maxAttachmentBytes = 3 * 1024 * 1024;

export function formatAttachmentLimit(bytes = maxAttachmentBytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.floor(bytes / 1024)} KB`;
  }

  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}
