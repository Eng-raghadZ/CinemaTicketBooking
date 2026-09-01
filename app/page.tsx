export default function HomePage() {
  return (
    <main>
      <h1>Multi-Cinema Booking Platform</h1>
      <p>
        This is a temporary, minimal landing page — no visual design or
        customer-facing browsing yet. See <code>docs/architecture-plan.md</code>{" "}
        for the full roadmap.
      </p>
      <ul>
        <li>Phase 0 (foundations: auth, database, RLS, CI/CD) — implemented.</li>
        <li>
          Phase 1 (cinema onboarding and staff management) — implemented.
        </li>
        <li>Phase 2 (catalog management: movies, screens, showtimes) — implemented.</li>
        <li>
          Public customer browsing and booking — future work, per the current
          roadmap.
        </li>
      </ul>
    </main>
  );
}
