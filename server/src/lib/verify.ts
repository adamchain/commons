import twilio from "twilio";

/** Account SID, auth token, and Verify Service SID (Console → Verify → Services). */
export function isTwilioVerifyConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_VERIFY_SERVICE_SID?.trim(),
  );
}

function getClient(): ReturnType<typeof twilio> {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

/** Sends SMS via Twilio Verify (code length and template are controlled in the Verify service). */
export async function startPhoneVerification(to: string): Promise<void> {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  await getClient().verify.v2.services(sid).verifications.create({
    to,
    channel: "sms",
  });
}

export async function checkPhoneVerification(to: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const check = await getClient().verify.v2.services(sid).verificationChecks.create({
    to,
    code,
  });
  return check.status === "approved";
}
