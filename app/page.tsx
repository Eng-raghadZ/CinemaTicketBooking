import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Multi-Cinema Booking Platform</h1>
      <p>
        This is a temporary, minimal landing page — no visual redesign yet. See{" "}
        <code>docs/architecture-plan.md</code> for the full roadmap.
      </p>
      <nav aria-label="Browse">
        <Link href="/cinemas">Browse cinemas</Link>
        {" | "}
        <Link href="/movies">Browse movies</Link>
        {" | "}
        <Link href="/showtimes">Browse showtimes</Link>
      </nav>
      <ul>
        <li>Phase 0 (foundations: auth, database, RLS, CI/CD) — implemented.</li>
        <li>
          Phase 1 (cinema onboarding and staff management) — implemented.
        </li>
        <li>Phase 2 (catalog management: movies, screens, showtimes) — implemented.</li>
        <li>Phase 3 (public customer browsing) — implemented.</li>
        <li>Seat selection and booking — future work, per the current roadmap.</li>
      </ul>
    </main>
  );
}
