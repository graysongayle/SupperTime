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
): string[] {
  const addresses = [
    message.emailFrom || message.agent?.email,
    message.emailTo,
    message.emailCc,
  ].flatMap((value) => value?.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []);
  const [supportLocal, supportDomain] = supportEmail.toLowerCase().split("@");

  return [...new Set(addresses.map((email) => email.toLowerCase()))].filter(
    (email) => {
      const [local, domain] = email.split("@");
      return !(
        domain === supportDomain &&
        (local === supportLocal || local.startsWith(`${supportLocal}+`))
      );
    },
  );
}
