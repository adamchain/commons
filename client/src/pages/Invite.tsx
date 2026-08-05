import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { ScreenTitle } from "../components/ui";
import { getPublicWebOrigin } from "../lib/platform";
import type { InviteCodeDTO } from "../types/shared";

/**
 * Launch-mechanic invite codes — five per user (2.10). Each code is shown
 * with its own share button; the deep link drops the recipient on onboarding
 * with the code prefilled. Redeemed codes show who used them.
 */
export function InvitePage() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "a friend";
  const [codes, setCodes] = useState<InviteCodeDTO[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    void api<{ codes: InviteCodeDTO[] }>("/api/auth/invite-codes")
      .then((r) => setCodes(r.codes))
      .catch(() => setCodes([]));
  }, []);

  function shareCode(code: string) {
    const url = `${getPublicWebOrigin()}/?invite=${encodeURIComponent(code)}`;
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
    const url = `${getPublicWebOrigin()}/?invite=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link", url);
    }
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
  }

  const active = (codes ?? []).filter((c) => c.redeemedAt === null);
  const used = (codes ?? []).filter((c) => c.redeemedAt !== null);
  const remaining = active.length;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user?.id ?? ""}`} className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Profile
        </Link>
      </header>
      <ScreenTitle
        title="Invite your friends"
        subtitle={
          <>
            You&apos;ve got <strong>{remaining}</strong> code{remaining === 1 ? "" : "s"} left. Each one gets one person in.
          </>
        }
      />

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
                      <button
                        type="button"
                        className={`btn-pill-ghost ${copiedCode === c.code ? "is-copied" : ""}`}
                        onClick={() => void copyCode(c.code)}
                      >
                        {copiedCode === c.code ? (
                          <>
                            <span aria-hidden="true">✓</span> Copied
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">⧉</span> Copy
                          </>
                        )}
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
            <strong>Why only a few invites?</strong>
            <p>
              COMMONS works because of who’s in it — women who actually show up for each other. So
              we’re growing it the way it started: one person passing it to someone they’d genuinely
              want to make plans with.
            </p>
            <p>
              The more of us who show up like that, the better this gets for everyone. So think about
              who’d make it better — and bring them in.
            </p>
          </aside>
        </>
      )}
    </main>
  );
}
