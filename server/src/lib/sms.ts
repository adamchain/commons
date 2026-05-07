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

export async function sendSmsInvite(phoneNumber: string, inviterFirstName: string, planTitle: string, link: string): Promise<void> {
  const body = `${inviterFirstName} invited you to "${planTitle}" on Commons. ${link}`;
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
