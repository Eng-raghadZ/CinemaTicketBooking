"use client";
/* eslint-disable @next/next/no-img-element -- temporary user-replaceable preview artwork */
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import s from "./homepage.module.css";

const movies = [
  "Mortal Engines",
  "Oppenheimer",
  "Dune: Part Two",
  "The Nun II",
  "Blade Runner 2049",
];
const cinemas = [
  "Moviera Ramallah",
  "Moviera Nablus",
  "Grand Cinema City Mall",
];
const image = "/images/moviera/hero.png";
function Icon({ kind }: { kind: "search" | "bell" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {kind === "search" ? (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="m15 15 6 6" />
        </>
      ) : (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 6-3 8-3 9h18c0-1-3-3-3-9M10 21h4" />
        </>
      )}
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg
      className={s.accountChevron}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3.5 5.25 3.5 3.5 3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Brand() {
  return (
    <Link href="/" className={s.brand}>
      MOVIERA<small>CINEMA</small>
    </Link>
  );
}
function Picture({
  position = "center",
  src,
}: {
  position?: string;
  src?: string | null;
}) {
  // Temporary local artwork. Replace with individual files when supplied.
  return (
    <img
      src={src || image}
      alt=""
      loading="lazy"
      style={{ objectPosition: position }}
    />
  );
}
export default function Homepage({
  email,
  liveMovies,
  liveCinemas,
}: {
  email: string | null;
  liveMovies: {
    id: string;
    title: string;
    poster_url: string | null;
    duration_minutes: number;
    rating: string | null;
  }[];
  liveCinemas: { id: string; name: string; location: string | null }[];
}) {
  const previewMovies =
    liveMovies.length >= 2
      ? liveMovies
      : [
          ...liveMovies,
          ...movies
            .filter(
              (title) => !liveMovies.some((movie) => movie.title === title),
            )
            .slice(0, 2 - liveMovies.length)
            .map((title, index) => ({
              id: `preview-${index}`,
              title,
              poster_url: null,
              duration_minutes: 0,
              rating: null,
            })),
        ];
  const titles = previewMovies.map((movie) => movie.title);
  const venueNames = liveCinemas.length
    ? liveCinemas.slice(0, 3).map((c) => c.name)
    : cinemas;
  const [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (
      titles.length < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = window.setInterval(
      () => setSelected((current) => (current + 1) % titles.length),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [titles.length]);
  const moveHero = (step: number) =>
    setSelected((current) => (current + step + titles.length) % titles.length);
  const heroStyle = {
    "--hero-image": `url("${previewMovies[selected]?.poster_url || image}")`,
  } as CSSProperties;
  return (
    <div className={s.home}>
      <a className={s.skip} href="#content">
        Skip to content
      </a>
      <header className={`${s.header} ${scrolled ? s.scrolled : ""}`}>
        <Brand />
        <button
          className={s.toggle}
          aria-expanded={menu}
          aria-controls="navigation"
          onClick={() => setMenu(!menu)}
        >
          {menu ? "Close ✕" : "Menu ☰"}
        </button>
        <nav
          id="navigation"
          className={`${s.nav} ${menu ? s.open : ""}`}
          aria-label="Main navigation"
        >
          <Link href="/" aria-current="page">
            Home
          </Link>
          <Link href="/cinemas">Cinemas</Link>
          <Link href="/movies">Movies</Link>
          <Link href="/showtimes">Showtimes</Link>
        </nav>
        <div className={s.account}>
          <a href="#finder" aria-label="Find a showtime">
            <Icon kind="search" />
          </a>
          <button
            disabled
            aria-label="Notifications coming soon"
            title="Coming soon"
          >
            <Icon kind="bell" />
          </button>
          {email ? (
            <details>
              <summary>
                <span className={s.avatar}>
                  {email.charAt(0).toUpperCase()}
                </span>
                <span className={s.username}>{email.split("@")[0]}</span>
                <ChevronDown />
              </summary>
              <div className={s.dropdown}>
                <Link href="/dashboard">Dashboard</Link>
                <SignOutButton />
              </div>
            </details>
          ) : (
            <Link href="/login" className={s.signin}>
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main id="content">
        <section
          className={s.hero}
          style={heroStyle}
          aria-roledescription="carousel"
          aria-label="Featured movies"
        >
          <div className={s.heroCopy} key={selected}>
            <p className={s.eyebrow}>NOW SHOWING</p>
            <h1>{titles[selected]}</h1>
            <p className={s.meta}>
              {previewMovies[selected]?.duration_minutes
                ? `${previewMovies[selected].duration_minutes} min · ${previewMovies[selected].rating ?? "Not rated"}`
                : "Preview · Film details coming soon"}
            </p>
            <p className={s.rating}>
              <span>★</span> — <small>Reviews coming soon</small>
            </p>
            <p className={s.description}>
              Discover a world beyond the ordinary. Find your next big-screen
              adventure and experience the magic of cinema.
            </p>
            <div className={s.actions}>
              <Link href="/booking-unavailable" className={s.primary}>
                Book tickets
              </Link>
              <button disabled title="Coming soon" className={s.outline}>
                ▷ &nbsp; Watch trailer
              </button>
            </div>
          </div>
          <button
            className={`${s.heroArrow} ${s.previous}`}
            onClick={() => moveHero(-1)}
            aria-label="Previous featured movie"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            className={`${s.heroArrow} ${s.next}`}
            onClick={() => moveHero(1)}
            aria-label="Next featured movie"
          >
            <span aria-hidden="true">›</span>
          </button>
          <div className={s.dots} aria-label="Choose featured movie">
            {titles.map((title, index) => (
              <button
                key={title}
                onClick={() => setSelected(index)}
                aria-label={`Show ${title}`}
                aria-current={selected === index ? "true" : undefined}
              >
                {selected === index && <span key={selected} />}
              </button>
            ))}
          </div>
          <p className={s.tagline}>
            SOME CITIES
            <br />
            MOVE FOREVER
          </p>
        </section>
        <section className={s.section}>
          <div className={s.heading}>
            <h2>Now showing</h2>
            <Link href="/movies">View All Movies →</Link>
          </div>
          <p className={s.notice}>
            {liveMovies.length
              ? "Upcoming films · artwork can be replaced."
              : "Design preview · sample films, not live listings."}
          </p>
          <div className={s.films}>
            {titles.map((title, i) => (
              <button
                key={title}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
                className={`${s.film} ${selected === i ? s.selected : ""}`}
              >
                <Picture
                  src={previewMovies[i]?.poster_url}
                  position={`${70 + i * 5}% center`}
                />
                <div>
                  <h3>{title}</h3>
                  <p>{previewMovies[i]?.rating ?? "Preview"}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className={s.section} id="finder">
          <div className={s.heading}>
            <h2>Find a showtime</h2>
          </div>
          <form action="/showtimes" className={s.finder}>
            <label>
              <span>Location · coming soon</span>
              <select disabled defaultValue="Ramallah">
                <option>Ramallah</option>
              </select>
            </label>
            <label>
              <span>Cinema</span>
              <select name="cinemaId">
                <option value="">All Cinemas</option>
                {liveCinemas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Date</span>
              <input type="date" name="date" />
            </label>
            <button className={s.primary}>Search</button>
          </form>
        </section>
        <section className={s.section}>
          <div className={s.heading}>
            <h2>Featured cinemas</h2>
            <Link href="/cinemas">View All Cinemas →</Link>
          </div>
          <div className={s.cinemas}>
            {venueNames.map((name, i) => (
              <article className={s.cinema} key={name}>
                <Picture position={`${i * 30}% center`} />
                <div>
                  <h3>{name}</h3>
                  <p>
                    ⌖{" "}
                    {liveCinemas[i]?.location ??
                      (i ? "Nablus, Palestine" : "Ramallah, Palestine")}
                  </p>
                  <span className={s.chevron} aria-hidden="true">
                    ›
                  </span>
                </div>
              </article>
            ))}
          </div>
          <p className={s.notice}>
            {liveCinemas.length
              ? "Explore cinema details through View All Cinemas."
              : "Sample venues · not live listings."}
          </p>
        </section>
        <section className={s.banner}>
          <h2>Ready to watch?</h2>
          <p>
            Book your tickets now and experience
            <br />
            the magic on the big screen.
          </p>
          <Link href="/booking-unavailable" className={s.primary}>
            Book tickets
          </Link>
        </section>
      </main>
      <footer className={s.footer}>
        <Brand />
        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/cinemas">Cinemas</Link>
          <Link href="/movies">Movies</Link>
          <Link href="/showtimes">Showtimes</Link>
          <span title="Coming soon">Help Center</span>
          <span title="Coming soon">Terms of Use</span>
          <span title="Coming soon">Privacy Policy</span>
        </nav>
        <span className={s.contact}>
          Social & contact details · Coming soon
        </span>
      </footer>
    </div>
  );
}
