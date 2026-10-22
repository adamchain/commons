import { Router } from "express";
import { isAdminPhone } from "../lib/adminPhones.js";
import { signSessionToken } from "../lib/jwt.js";
import { normalizePhone } from "../lib/phone.js";
import { checkPhoneVerification, isTwilioVerifyConfigured, startPhoneVerification, verificationStillOpen, } from "../lib/verify.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { store } from "../store.js";
import { createUser, findUserByPhone } from "../userRepo.js";
/**
 * Phone sign-in for `/admin` only. Sets `admin_session`, never the app `session`
 * cookie, and refuses every number that is not in ADMIN_PHONE_NUMBERS.
 */
export const adminAuthRouter = Router();
const CODE_TTL_MS = 10 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;
function phoneKey(prefix, req) {
    const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
    return phone ? `${prefix}:phone:${phone}` : null;
}
const limitRequestByPhone = rateLimit({
    windowMs: FIFTEEN_MIN,
    max: 5,
    key: (req) => phoneKey("admin-request", req),
});
const limitRequestByIp = rateLimit({
    windowMs: FIFTEEN_MIN,
    max: 20,
    key: (req) => `admin-request:ip:${req.ip}`,
});
const limitVerifyByPhone = rateLimit({
    windowMs: TEN_MIN,
    max: 8,
    key: (req) => phoneKey("admin-verify", req),
});
const limitVerifyByIp = rateLimit({
    windowMs: TEN_MIN,
    max: 30,
    key: (req) => `admin-verify:ip:${req.ip}`,
});
function parseTwilioError(err) {
    if (typeof err !== "object" || err === null)
        return {};
    const maybe = err;
    return {
        code: typeof maybe.code === "number" ? maybe.code : undefined,
        status: typeof maybe.status === "number" ? maybe.status : undefined,
        message: typeof maybe.message === "string" ? maybe.message : undefined,
    };
}
function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function rejectUnlessAdmin(phone, res) {
    if (isAdminPhone(phone))
        return false;
    res.status(403).json({ error: "This number isn't on the admin list." });
    return true;
}
function setAdminSessionCookie(res, userId, sessionVersion = 0) {
    const token = signSessionToken(userId, sessionVersion);
    res.cookie("admin_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/admin",
        maxAge: 1000 * 60 * 60 * 24 * 30,
    });
}
adminAuthRouter.post("/request-code", limitRequestByPhone, limitRequestByIp, async (req, res) => {
    const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
    if (!phone) {
        res.status(400).json({ error: "A valid phone number is required" });
        return;
    }
    if (rejectUnlessAdmin(phone, res))
        return;
    if (isTwilioVerifyConfigured()) {
        try {
            const started = await startPhoneVerification(phone);
            res.json({
                ok: true,
                phoneNumber: phone,
                smsConfigured: true,
                authMode: "verify",
                reused: started.reused,
            });
        }
        catch (err) {
            console.error("[admin-auth] Twilio Verify send failed", err);
            const twilio = parseTwilioError(err);
            if (twilio.code === 21608) {
                res.status(403).json({
                    error: "Twilio trial account can only send to verified phone numbers. Verify this number in Twilio or upgrade the account.",
                });
                return;
            }
            res.status(502).json({ error: "Could not send verification text. Try again in a moment." });
        }
        return;
    }
    const code = generateCode();
    console.log(`[admin-auth sms dev] ${phone}: code = ${code}`);
    store.saveSmsCode(phone, code, CODE_TTL_MS);
    res.json({ ok: true, phoneNumber: phone, smsConfigured: false, authMode: "dev" });
});
adminAuthRouter.post("/verify-code", limitVerifyByPhone, limitVerifyByIp, async (req, res) => {
    const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
    const code = String(req.body?.code ?? "").trim();
    if (!phone || !code) {
        res.status(400).json({ error: "Phone and code are required" });
        return;
    }
    if (rejectUnlessAdmin(phone, res))
        return;
    if (isTwilioVerifyConfigured()) {
        let result;
        try {
            result = await checkPhoneVerification(phone, code);
        }
        catch (err) {
            console.error("[admin-auth] Twilio Verify check failed", err);
            const twilio = parseTwilioError(err);
            if (twilio.code === 20404 || twilio.code === 60200) {
                res.status(400).json({ error: "That code or phone number is invalid. Request a new code and try again." });
                return;
            }
            if (twilio.code === 60202) {
                res.status(429).json({ error: "Too many attempts. Request a new code and try again." });
                return;
            }
            res.status(502).json({ error: "Verification failed. Try again." });
            return;
        }
        if (result === "expired") {
            res.status(401).json({
                error: verificationStillOpen(phone)
                    ? "That code is from an older text. Use the latest one we sent."
                    : "That code expired. Request a new one and use the latest text.",
            });
            return;
        }
        if (result !== "approved") {
            res.status(401).json({ error: "That code doesn't match. Check the latest text and try again." });
            return;
        }
    }
    else if (!store.consumeSmsCode(phone, code)) {
        res.status(401).json({ error: "Invalid or expired code" });
        return;
    }
    let user = await findUserByPhone(phone);
    if (!user) {
        try {
            user = await createUser(phone);
        }
        catch (err) {
            const isDuplicateKey = typeof err === "object" &&
                err !== null &&
                "code" in err &&
                err.code === 11000;
            if (isDuplicateKey)
                user = await findUserByPhone(phone);
            else {
                console.error("[admin-auth] create user failed", err);
                res.status(500).json({ error: "Could not finish sign in. Please try again." });
                return;
            }
        }
    }
    if (!user) {
        res.status(500).json({ error: "Could not finish sign in. Please try again." });
        return;
    }
    if (user.ejectedAt) {
        res.status(403).json({ error: "This account was removed for violating the COMMONS Terms of Service." });
        return;
    }
    setAdminSessionCookie(res, user.id, user.sessionVersion ?? 0);
    res.json({ ok: true });
});
