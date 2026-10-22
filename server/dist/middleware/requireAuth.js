import { sessionVersionMatches, verifySessionToken } from "../lib/jwt.js";
import { findUserById } from "../userRepo.js";
function tokenFromRequest(req) {
    const header = req.headers.authorization;
    if (header && /^Bearer\s+/i.test(header)) {
        return header.replace(/^Bearer\s+/i, "").trim() || undefined;
    }
    return req.cookies?.session;
}
export async function requireAuth(req, res, next) {
    const token = tokenFromRequest(req);
    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const payload = verifySessionToken(token);
        const user = await findUserById(payload.sub);
        if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        if (user.ejectedAt) {
            res.status(403).json({ error: "This account was removed for violating the COMMONS Terms of Service." });
            return;
        }
        if (!sessionVersionMatches(user.sessionVersion, payload.sv)) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        req.userId = user.id;
        next();
    }
    catch {
        res.status(401).json({ error: "Unauthorized" });
    }
}
