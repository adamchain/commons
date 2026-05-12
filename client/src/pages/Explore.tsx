/**
 * Explore — coming-soon placeholder. Tab is visible in the bottom nav (muted)
 * but the screen itself just sets expectations. One job in V2: find and join
 * communities (run clubs, book clubs, recurring plans).
 */
export function ExplorePage() {
  return (
    <main className="app-shell app-shell--with-nav">
      <section className="explore-coming-soon">
        <div className="explore-coming-soon-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="m16 8-3 5-5 3 3-5 5-3z" />
          </svg>
        </div>
        <h1 className="explore-coming-soon-title">Explore is coming soon</h1>
        <p className="explore-coming-soon-body">
          COMMONS is just getting started. Explore — neighborhoods, communities
          — is coming soon once the feed is alive.
        </p>
        <ul className="explore-coming-soon-preview" aria-label="What's coming">
          <li>
            <span className="explore-preview-emoji" aria-hidden="true">🏃</span>
            <div>
              <strong>Run clubs</strong>
              <span>Recurring Saturday loops in your neighborhood.</span>
            </div>
          </li>
          <li>
            <span className="explore-preview-emoji" aria-hidden="true">📖</span>
            <div>
              <strong>Book clubs</strong>
              <span>Same group, monthly cadence, real picks.</span>
            </div>
          </li>
          <li>
            <span className="explore-preview-emoji" aria-hidden="true">🎲</span>
            <div>
              <strong>Recurring plans</strong>
              <span>Trivia night, coffee club, whatever sticks.</span>
            </div>
          </li>
        </ul>
      </section>
    </main>
  );
}
