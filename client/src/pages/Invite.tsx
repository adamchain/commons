import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { InviteCodeDTO } from "../types/shared";

/**
 * Launch-mechanic invite codes — three per user. Each code is shown with its
 * own share button; the deep link drops the recipient on onboarding with the
 * code prefilled. Redeemed codes show who used them.
 */
export function InvitePage() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "a friend";
  const [codes, setCodes] = useState<InviteCodeDTO[] | null>(null);

  useEffect(() => {
    void api<{ codes: InviteCodeDTO[] }>("/api/auth/invite-codes")
      .then((r) => setCodes(r.codes))
      .catch(() => setCodes([]));
  }, []);

  function shareCode(code: string) {
    const url = `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
    const body = `${firstName} invited you to Commons — neighborhood plans, no pressure. Code: ${code}\n${url}`;
    const data = { title: "Join me on Commons", text: body, url };
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      void nav.share(data).catch(() => undefined);
      return;
    }
    window.location.href = `sms:?&body=${encodeURIComponent(body)}`;
  }

  async function copyCode(code: string) {
    const url = `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  const remaining = (codes ?? []).filter((c) => c.redeemedAt === null).length;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={user ? `/profile/${user.id}` : "/"} className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 4 }}>
        Invite friends
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        {remaining} code{remaining === 1 ? "" : "s"} left · each one gets one person in
      </p>

      {codes === null && <p className="form-help">Loading…</p>}
      {codes !== null && (
        <ul className="invite-code-list">
          {codes.map((c) => (
            <li key={c.code} className={`invite-code-row ${c.redeemedAt ? "is-redeemed" : ""}`}>
              <code className="invite-code-value">{c.code}</code>
              {c.redeemedAt ? (
                <span className="invite-code-meta">Used by {c.redeemedByFirstName ?? "someone"}</span>
              ) : (
                <div className="invite-code-actions">
                  <button type="button" className="btn-link" onClick={() => void copyCode(c.code)}>
                    Copy link
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => shareCode(c.code)}>
                    Share
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
