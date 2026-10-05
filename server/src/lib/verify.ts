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

/** A second send inside this window would cancel the text that's already on its way. */
const SEND_COOLDOWN_MS = 30_000;
/** A duplicate check of a code we just approved should still sign the person in. */
const APPROVAL_GRACE_MS = 60_000;

const recentSends = new Map<string, number>();
const sendsInFlight = new Map<string, Promise<void>>();
const recentApprovals = new Map<string, { at: number; code: string }>();
const checksInFlight = new Map<string, Promise<PhoneCheckResult>>();

export type PhoneCheckResult = "approved" | "mismatch" | "expired";

/**
 * Starts an SMS verification. A second call for the same number while one is
 * in flight, or within the cooldown, does not ask Twilio again — a new
 * verification cancels the previous code, which is how a retry was marking
 * the text the person actually received as expired.
 */
export async function startPhoneVerification(to: string): Promise<{ reused: boolean }> {
  const last = recentSends.get(to) ?? 0;
  if (Date.now() - last < SEND_COOLDOWN_MS) return { reused: true };

  const existing = sendsInFlight.get(to);
  if (existing) {
    await existing;
    return { reused: true };
  }

  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const task = getClient()
    .verify.v2.services(sid)
    .verifications.create({ to, channel: "sms" })
    .then(() => {
      recentSends.set(to, Date.now());
    });
  sendsInFlight.set(to, task);
  try {
    await task;
    return { reused: false };
  } finally {
    if (sendsInFlight.get(to) === task) sendsInFlight.delete(to);
  }
}

export function checkPhoneVerification(to: string, code: string): Promise<PhoneCheckResult> {
  const key = `${to}:${code}`;
  const existing = checksInFlight.get(key);
  if (existing) return existing;

  const task = checkOnce(to, code).finally(() => {
    if (checksInFlight.get(key) === task) checksInFlight.delete(key);
  });
  checksInFlight.set(key, task);
  return task;
}

async function checkOnce(to: string, code: string): Promise<PhoneCheckResult> {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  try {
    const check = await getClient().verify.v2.services(sid).verificationChecks.create({ to, code });
    if (check.status === "approved") {
      recentApprovals.set(to, { at: Date.now(), code });
      recentSends.delete(to);
      return "approved";
    }
    if (check.status === "canceled" || check.status === "expired") return "expired";
    return "mismatch";
  } catch (err) {
    const twilioCode =
      typeof err === "object" && err !== null && "code" in err && typeof (err as { code?: unknown }).code === "number"
        ? (err as { code: number }).code
        : undefined;
    const prev = recentApprovals.get(to);
    if (twilioCode === 20404 && prev && prev.code === code && Date.now() - prev.at < APPROVAL_GRACE_MS) {
      return "approved";
    }
    throw err;
  }
}
