import twilio from "twilio";

/** Programmable Messaging — invites only. Phone sign-in uses Twilio Verify (`lib/verify.ts`). */

/** All three are required to send SMS via Twilio (not console). */
export function isTwilioSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

function isDeliverablePhone(phoneNumber: string): boolean {
  return phoneNumber.startsWith("+");
}

/** Mark Commons links in a text so a later signup can be counted as SMS or iMessage. */
function tagCommonsLinks(body: string): string {
  return body.replace(/https?:\/\/[^\s]+/gi, (raw) => {
    const trimmed = raw.replace(/[),.;!?]+$/, "");
    const suffix = raw.slice(trimmed.length);
    try {
      const url = new URL(trimmed);
      const host = url.hostname.replace(/^www\./, "");
      const ours =
        host === "oncommons.co" ||
        host.endsWith(".oncommons.co") ||
        host === "localhost" ||
        host === "127.0.0.1";
      if (!ours || url.searchParams.has("from")) return raw;
      url.searchParams.set("from", "sms");
      return url.toString() + suffix;
    } catch {
      return raw;
    }
  });
}

export async function sendSmsInvite(phoneNumber: string, inviterFirstName: string, planTitle: string, link: string): Promise<void> {
  if (!isDeliverablePhone(phoneNumber)) return;
  const body = `${inviterFirstName} invited you to "${planTitle}" on Commons. ${tagCommonsLinks(link)}`;
  if (isTwilioSmsConfigured()) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER!,
      to: phoneNumber,
      body,
    });
    return;
  }
  console.log(`[sms-invite] ${phoneNumber}: ${body}`);
}

/** Short transactional texts (nudges, lock-in, reminders). Logs when SMS isn’t configured. */
export async function sendTransactionalSms(phoneNumber: string, body: string): Promise<void> {
  if (!isDeliverablePhone(phoneNumber)) return;
  body = tagCommonsLinks(body);
  if (isTwilioSmsConfigured()) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER!,
      to: phoneNumber,
      body,
    });
    return;
  }
  console.log(`[sms] ${phoneNumber}: ${body}`);
}
