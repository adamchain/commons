/**
 * Explore — coming-soon placeholder. Tab is visible in the bottom nav (muted) but
 * the screen itself just sets expectations. Real neighborhoods + communities work
 * lands in V2.
 */
export function ExplorePage() {
  return (
    <main className="app-shell">
      <section className="explore-coming-soon">
        <div className="explore-coming-soon-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="m16 8-3 5-5 3 3-5 5-3z" />
          </svg>
        </div>
        <h1 className="explore-coming-soon-title">Explore is coming soon</h1>
        <p className="explore-coming-soon-body">
          COMMONS is just getting started. Explore — neighborhoods, communities —
          is coming soon once the feed is alive.
        </p>
      </section>
    </main>
  );
}
