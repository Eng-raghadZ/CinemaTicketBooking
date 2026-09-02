import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-main">
      <section className="home-hero">
        <div className="hero-content">
          <p className="eyebrow">CINEMA OPERATIONS</p>
          <h1>Every screen.<br />One platform.</h1>
          <p className="hero-copy">
            Manage your cinema, team, movies, screens<br className="desktop-break" />
            and showtimes from one focused workspace.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/login">Sign in to Moviera</Link>
            <Link className="button-secondary" href="/signup">Create an account</Link>
          </div>
        </div>
      </section>
      <section className="capability-strip" aria-label="Available capabilities">
        <article><span>01</span><h2>Cinema onboarding</h2><p>Set up your cinema, screens, locations and operational preferences.</p></article>
        <article><span>02</span><h2>Staff &amp; permissions</h2><p>Manage your team and control access with roles and permissions.</p></article>
        <article><span>03</span><h2>Movies, screens &amp; showtimes</h2><p>Organize your content, screens and showtimes in one central workspace.</p></article>
      </section>
    </main>
  );
}
