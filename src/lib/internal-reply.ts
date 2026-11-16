type InternalReplyMessage = {
  emailFrom: string | null;
  emailTo: string | null;
  emailCc: string | null;
  agent: { email: string } | null;
};

// Never use ticket customers, participants, or submitted recipient fields here.
export function getInternalReplyRecipients(
  message: InternalReplyMessage,
  supportEmail: string,
  replyingEmail: string | null,
): string[] {
  const addresses = [
    // The linked author is authoritative for agent notes, including legacy notes
    // whose From metadata may identify the notified teammate instead.
    message.agent?.email || message.emailFrom,
    message.emailTo,
    message.emailCc,
  ].flatMap((value) => value?.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []);
  const [supportLocal, supportDomain] = supportEmail.trim().toLowerCase().split("@");
  const replyingAddress = replyingEmail?.trim().toLowerCase();

  return [...new Set(addresses.map((email) => email.toLowerCase()))].filter(
    (email) => {
      const [local, domain] = email.split("@");
      return email !== replyingAddress && !(
        domain === supportDomain &&
        (local === supportLocal || local.startsWith(`${supportLocal}+`))
      );
    },
  );
}
