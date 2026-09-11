"use client";
/* eslint-disable @next/next/no-img-element -- temporary user-replaceable preview artwork */
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import s from "./homepage.module.css";

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
  heroMovies,
  liveCinemas,
  upcomingShowtimes,
}: {
  email: string | null;
  liveMovies: {
    id: string;
    title: string;
    poster_url: string | null;
    hero_image_url: string | null;
    trailer_url: string | null;
    duration_minutes: number;
    rating: string | null;
    description: string | null;
  }[];
  heroMovies: {
    id: string;
    title: string;
    poster_url: string | null;
    hero_image_url: string | null;
    trailer_url: string | null;
    duration_minutes: number;
    rating: string | null;
    description: string | null;
    next_showtime: string;
  }[];
  liveCinemas: {
    id: string;
    name: string;
    location: string | null;
    cover_image_url: string | null;
  }[];
  upcomingShowtimes: {
    id: string;
    starts_at: string;
    base_price: string;
    currency_code: string;
    movies: { id: string; title: string; poster_url: string | null } | null;
    cinemas: { id: string; name: string } | null;
    screens: { name: string } | null;
  }[];
}) {
  const showingMovies = liveMovies;
  const titles = heroMovies.map((movie) => movie.title);
  const FEATURED_CINEMAS_COUNT = 6;
  const featuredCinemas = liveCinemas.slice(0, FEATURED_CINEMAS_COUNT);
  const locations = Array.from(
    new Set(liveCinemas.map((cinema) => cinema.location).filter(Boolean)),
  ) as string[];
  const [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedCinema, setSelectedCinema] = useState("");
  const [selectedMovieCard, setSelectedMovieCard] = useState<string | null>(
    null,
  );
  const [selectedShowtimeCard, setSelectedShowtimeCard] = useState<
    string | null
  >(null);
  const filmsRail = useRef<HTMLDivElement>(null);
  const cinemasRail = useRef<HTMLDivElement>(null);
  const showtimesRail = useRef<HTMLDivElement>(null);
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
    const timer = window.setTimeout(
      () => setSelected((current) => (current + 1) % titles.length),
      8000,
    );
    return () => window.clearTimeout(timer);
  }, [selected, titles.length]);
  const moveHero = (step: number) =>
    setSelected((current) => (current + step + titles.length) % titles.length);
  const scrollRail = (rail: HTMLDivElement | null) => {
    if (!rail) return;
    rail.scrollBy({
      left: Math.max(260, rail.clientWidth * 0.72),
      behavior: "smooth",
    });
  };
  const heroStyle = {
    "--hero-image": `url("${heroMovies[selected]?.hero_image_url || heroMovies[selected]?.poster_url || image}")`,
  } as CSSProperties;
  const activeMovie = heroMovies[selected];
  const cinemasForLocation = selectedLocation
    ? liveCinemas.filter((cinema) => cinema.location === selectedLocation)
    : liveCinemas;
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
          aria-roledescription="carousel"
          aria-label="Featured movies"
        >
          <div
            className={s.heroBackdrop}
            style={heroStyle}
            key={`hero-background-${selected}`}
            aria-hidden="true"
          />
          <div className={s.heroCopy} key={activeMovie?.id ?? "empty"}>
            <p className={s.eyebrow}>COMING UP</p>
            <h1>{activeMovie?.title ?? "No upcoming movies right now"}</h1>
            <p className={s.meta}>
              {activeMovie ? (
                <>
                  {activeMovie.duration_minutes} min ·{" "}
                  {activeMovie.rating ?? "Not rated"} · Next showtime{" "}
                  <time
                    dateTime={activeMovie.next_showtime}
                    suppressHydrationWarning
                  >
                    {new Date(activeMovie.next_showtime).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </>
              ) : (
                "Check back soon for upcoming showtimes"
              )}
            </p>
            {activeMovie && (
              <p className={s.rating}>
                <span>★</span> — <small>Reviews coming soon</small>
              </p>
            )}
            <p className={s.description}>
              {activeMovie?.description ??
                (activeMovie
                  ? "Choose a showtime and enjoy this movie on the big screen."
                  : "There are no upcoming movies available at approved cinemas.")}
            </p>
            {activeMovie && (
              <div className={s.actions}>
                <Link href={`/movies/${activeMovie.id}`} className={s.outline}>
                  Movie details
                </Link>
                {activeMovie.trailer_url ? (
                  <a
                    href={activeMovie.trailer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.primary}
                  >
                    ▷ Watch trailer
                  </a>
                ) : (
                  <button
                    type="button"
                    className={s.primary}
                    disabled
                    title="Trailer unavailable"
                  >
                    ▷ Trailer unavailable
                  </button>
                )}
              </div>
            )}
          </div>
          {titles.length > 1 && (
            <>
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
                    key={heroMovies[index]?.id ?? title}
                    onClick={() => setSelected(index)}
                    aria-label={`Show ${title}`}
                    aria-current={selected === index ? "true" : undefined}
                  >
                    {selected === index && <span key={selected} />}
                  </button>
                ))}
              </div>
            </>
          )}
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
          {!showingMovies.length && (
            <p className={s.empty}>No movies are showing right now.</p>
          )}
          <div className={s.rail}>
            <div className={s.films} ref={filmsRail}>
              {showingMovies.map((movie, i) => (
                <button
                  key={movie.id}
                  onClick={() => setSelectedMovieCard(movie.id)}
                  className={`${s.film} ${selectedMovieCard === movie.id ? s.cardSelected : ""}`}
                  aria-pressed={selectedMovieCard === movie.id}
                >
                  <Picture
                    src={movie.poster_url}
                    position={`${70 + i * 5}% center`}
                  />
                  <div>
                    <h3>{movie.title}</h3>
                    <p>{movie.rating ?? "Not rated"}</p>
                  </div>
                </button>
              ))}
            </div>
            {showingMovies.length > 1 && (
              <button
                type="button"
                className={s.railArrow}
                onClick={() => scrollRail(filmsRail.current)}
                aria-label="Scroll through now showing movies"
              >
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        </section>
        <section className={s.section} id="finder">
          <div className={s.heading}>
            <h2>Find a showtime</h2>
          </div>
          <form action="/showtimes" className={s.finder}>
            <label>
              <span>Location</span>
              <select
                value={selectedLocation}
                onChange={(event) => {
                  setSelectedLocation(event.target.value);
                  setSelectedCinema("");
                }}
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Cinema</span>
              <select
                name="cinemaId"
                value={selectedCinema}
                onChange={(event) => setSelectedCinema(event.target.value)}
              >
                <option value="">All Cinemas</option>
                {cinemasForLocation.map((c) => (
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
          <div className={s.rail}>
            <div className={s.cinemas} ref={cinemasRail}>
              {featuredCinemas.map((cinema, i) => (
                <Link
                  href={`/cinemas/${cinema.id}`}
                  className={s.cinema}
                  key={cinema.id}
                  aria-label={`View ${cinema.name} details`}
                >
                  <Picture
                    src={cinema.cover_image_url}
                    position={`${i * 30}% center`}
                  />
                  <div>
                    <h3>{cinema.name}</h3>
                    <p>⌖ {cinema.location ?? "Location not provided"}</p>
                    <span className={s.chevron} aria-hidden="true">
                      ›
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {featuredCinemas.length > 1 && (
              <button
                type="button"
                className={s.railArrow}
                onClick={() => scrollRail(cinemasRail.current)}
                aria-label="Scroll through featured cinemas"
              >
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
          {!featuredCinemas.length && (
            <p className={s.empty}>
              No approved cinemas are available right now.
            </p>
          )}
        </section>
        <section className={s.section}>
          <div className={s.heading}>
            <h2>Upcoming showtimes</h2>
            <Link href="/showtimes">View All Showtimes →</Link>
          </div>
          {!upcomingShowtimes.length && (
            <p className={s.empty}>No upcoming showtimes are available.</p>
          )}
          <div className={s.rail}>
            <div className={s.showtimes} ref={showtimesRail}>
              {upcomingShowtimes.map((showtime) => (
                <Link
                  className={`${s.film} ${s.showtimeCard} ${selectedShowtimeCard === showtime.id ? s.cardSelected : ""}`}
                  href={`/showtimes/${showtime.id}`}
                  key={showtime.id}
                  onClick={() => setSelectedShowtimeCard(showtime.id)}
                >
                  <Picture src={showtime.movies?.poster_url} />
                  <div className={s.showtimeDetails}>
                    <h3>{showtime.movies?.title ?? "Unknown movie"}</h3>
                    <time
                      dateTime={showtime.starts_at}
                      suppressHydrationWarning
                    >
                      {new Date(showtime.starts_at).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <p>{showtime.cinemas?.name ?? "Unknown cinema"}</p>
                    <strong>
                      {showtime.base_price} {showtime.currency_code}
                    </strong>
                  </div>
                </Link>
              ))}
            </div>
            {upcomingShowtimes.length > 1 && (
              <button
                type="button"
                className={s.railArrow}
                onClick={() => scrollRail(showtimesRail.current)}
                aria-label="Scroll through upcoming showtimes"
              >
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
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
