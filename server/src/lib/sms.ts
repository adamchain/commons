// SMS sender. Real Twilio integration when credentials are present;
// otherwise logs the code to the console so local dev works without keys.

export async function sendSmsCode(phoneNumber: string, code: string): Promise<void> {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    // @ts-expect-error — twilio is an optional dep installed separately for prod SMS
    const twilio = (await import("twilio")).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to: phoneNumber,
      body: `Your Commons code: ${code}`,
    });
    return;
  }

  // Local dev fallback when Twilio isn't configured.
  console.log(`[sms] ${phoneNumber}: code = ${code}`);
}

export async function sendSmsInvite(phoneNumber: string, inviterFirstName: string, planTitle: string, link: string): Promise<void> {
  const body = `${inviterFirstName} invited you to "${planTitle}" on Commons. ${link}`;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    // @ts-expect-error — twilio is an optional dep installed separately for prod SMS
    const twilio = (await import("twilio")).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to: phoneNumber,
      body,
    });
    return;
  }
  console.log(`[sms-invite] ${phoneNumber}: ${body}`);
}
