import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-main">
      <section className="home-hero">
        <div className="hero-art" aria-hidden="true">
          <span className="film-frame frame-one" />
          <span className="film-frame frame-two" />
          <span className="hero-glow" />
        </div>
        <div className="hero-content">
          <p className="eyebrow">THE CINEMA, MADE SEAMLESS</p>
          <h1>Run every screen from one place.</h1>
          <p className="hero-copy">
            Manage cinema onboarding, staff access, movies, screens, and showtimes
            through one focused platform.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/login">Sign in to Moviera</Link>
            <Link className="button-secondary" href="/signup">Create an account</Link>
          </div>
        </div>
      </section>
      <section className="capability-strip" aria-label="Available capabilities">
        <article><span>01</span><h2>Cinema onboarding</h2><p>Register a cinema and follow its review status.</p></article>
        <article><span>02</span><h2>Team access</h2><p>Invite staff and manage permission-aware access.</p></article>
        <article><span>03</span><h2>Catalog operations</h2><p>Configure movies, screens, pricing, and showtimes.</p></article>
      </section>
    </main>
  );
}
