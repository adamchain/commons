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

  const active = (codes ?? []).filter((c) => c.redeemedAt === null);
  const used = (codes ?? []).filter((c) => c.redeemedAt !== null);
  const remaining = active.length;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">
          ← Settings
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 6 }}>
        Invite codes
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 20, textTransform: "none", letterSpacing: 0 }}>
        You’ve got <strong>{remaining}</strong> code{remaining === 1 ? "" : "s"} left. Each one gets one person in.
      </p>

      {codes === null && <p className="form-help">Loading…</p>}
      {codes !== null && (
        <>
          {active.length > 0 && (
            <section className="invite-section">
              <h2 className="invite-section-heading">Active · {active.length}</h2>
              <ul className="invite-code-list">
                {active.map((c) => (
                  <li key={c.code} className="invite-code-row">
                    <code className="invite-code-value">{c.code}</code>
                    <div className="invite-code-actions">
                      <button type="button" className="btn-pill-ghost" onClick={() => void copyCode(c.code)}>
                        <span aria-hidden="true">⧉</span> Copy
                      </button>
                      <button type="button" className="btn-pill-accent" onClick={() => shareCode(c.code)}>
                        Share
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {used.length > 0 && (
            <section className="invite-section">
              <h2 className="invite-section-heading">Already used · {used.length}</h2>
              <ul className="invite-code-list">
                {used.map((c) => (
                  <li key={c.code} className="invite-code-row is-redeemed">
                    <code className="invite-code-value">{c.code}</code>
                    <span className="invite-code-meta">used by {c.redeemedByFirstName ?? "someone"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <aside className="invite-limit-callout">
            <strong>Why are invites limited?</strong>
            <p>
              We’re keeping Philly close-knit while we get started. When the people you bring in show
              up, you get more codes.
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
