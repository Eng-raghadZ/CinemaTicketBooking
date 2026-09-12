import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  buildContainsPattern,
  buildPageHref,
  firstParam,
  isRangeNotSatisfiableError,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  resolvePage,
} from "@/lib/catalog/browse-query";
import { CinemaCard, CinemaDirectory, type CinemaSummary } from "./cinema-directory";
import styles from "./cinemas.module.css";

interface CinemaFilterOption {
  location: string | null;
  country_code: string;
}

export const metadata = { title: "Cinemas | Moviera" };

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ChevronIcon() {
  return <svg className={styles.selectArrow} viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 6 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default async function PublicCinemasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseSearchParam(firstParam(params.q));
  const location = parseSearchParam(firstParam(params.location));
  const country = parseSearchParam(firstParam(params.country));
  const requestedPage = parsePageParam(firstParam(params.page));
  const filters = { q, location, country };
  const pageHref = (targetPage: number) => buildPageHref("/cinemas", filters, targetPage);
  const supabase = await createServerSupabaseClient();

  const { data: filterData } = await supabase
    .from("cinemas")
    .select("location, country_code")
    .eq("status", "approved")
    .order("location", { ascending: true });

  let countQuery = supabase
    .from("cinemas")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  if (q) countQuery = countQuery.or(`name.ilike.${buildContainsPattern(q)},location.ilike.${buildContainsPattern(q)}`);
  if (location) countQuery = countQuery.eq("location", location);
  if (country) countQuery = countQuery.eq("country_code", country);

  const { count, error: countError } = await countQuery;
  if (countError) {
    return <main className={styles.page}><div className={styles.error} role="alert">Could not load cinemas right now. Please try again.</div></main>;
  }

  const { page, pages, needsRedirect } = resolvePage(requestedPage, count ?? 0, 6);
  if (needsRedirect) redirect(pageHref(page));

  const [from, to] = rangeForPage(page, 6);
  let query = supabase
    .from("cinemas")
    .select("id, name, description, location, country_code, currency_code, cover_image_url")
    .eq("status", "approved")
    .order("name", { ascending: true })
    .range(from, to);
  if (q) query = query.or(`name.ilike.${buildContainsPattern(q)},location.ilike.${buildContainsPattern(q)}`);
  if (location) query = query.eq("location", location);
  if (country) query = query.eq("country_code", country);

  const { data, error } = await query;
  if (error && !isRangeNotSatisfiableError(error)) {
    return <main className={styles.page}><div className={styles.error} role="alert">Could not load cinemas right now. Please try again.</div></main>;
  }

  let featuredQuery = supabase
    .from("cinemas")
    .select("id, name, description, location, country_code, currency_code, cover_image_url")
    .eq("status", "approved")
    .order("name", { ascending: true })
    .limit(4);
  if (q) featuredQuery = featuredQuery.or(`name.ilike.${buildContainsPattern(q)},location.ilike.${buildContainsPattern(q)}`);
  if (location) featuredQuery = featuredQuery.eq("location", location);
  if (country) featuredQuery = featuredQuery.eq("country_code", country);
  const { data: featuredData } = await featuredQuery;

  const cinemas = (data ?? []) as CinemaSummary[];
  const featuredCinemas = (featuredData ?? []) as CinemaSummary[];
  const options = (filterData ?? []) as CinemaFilterOption[];
  const locations = [...new Set(options.map((item) => item.location).filter((value): value is string => Boolean(value)))];
  const countries = [...new Set(options.map((item) => item.country_code))];
  const featured = featuredCinemas[0];
  const heroImage = featured?.cover_image_url || "/images/moviera/auth-cinema.png";
  const heroStyle = { "--cinema-hero": `url("${heroImage}")` } as CSSProperties;

  return (
    <main className={styles.page}>
      <section className={styles.hero} style={heroStyle}>
        <div className={styles.heroContent}>
          
          <h1>Cinemas</h1>
          <p>Find your perfect cinema experience.</p>
        </div>
        <p className={styles.heroQuote}>It&apos;s more than a movie.<br />It&apos;s a feeling.<span /></p>
      </section>

      <form className={styles.filters} method="get">
        <label className={styles.searchField}>
          <span className={styles.srOnly}>Search cinemas</span>
          <span className={styles.searchIcon}>⌕</span>
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Search cinemas..." />
        </label>
        <label className={styles.selectField}>
          <span className={styles.srOnly}>Location</span><PinIcon />
          <select name="location" defaultValue={location ?? ""}>
            <option value="">All locations</option>
            {locations.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronIcon />
        </label>
        <label className={styles.selectField}>
          <span className={styles.srOnly}>Country</span><span className={styles.globeIcon} aria-hidden="true">🌐︎</span>
          <select name="country" defaultValue={country ?? ""}>
            <option value="">All countries</option>
            {countries.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronIcon />
        </label>
        <button type="submit">Search</button>
      </form>

      <div className={styles.content}>
        {featured ? (
          <section className={styles.section}>
            <h2><span />Featured cinemas</h2>
            <div className={styles.railWrap}>
              <div className={styles.featuredRail}>
                {featuredCinemas.map((cinema) => <CinemaCard key={cinema.id} cinema={cinema} featured />)}
              </div>
            </div>
          </section>
        ) : (
          <div className={styles.empty}>No approved cinemas match the selected filters.</div>
        )}

        {featured && (
          <section className={styles.section}>
            <h2><span />All cinemas</h2>
            {cinemas.length ? (
              <CinemaDirectory initialCinemas={cinemas} initialPage={page} pages={pages} total={count ?? 0} q={q} location={location} country={country} />
            ) : <p className={styles.singleResult}>This is the only cinema matching your filters.</p>}
          </section>
        )}
      </div>

      <section className={styles.cta}>
        <div><h2>Ready for a bigger experience?</h2><p>Explore our cinemas and book your tickets now.</p></div>
        <Link href="/showtimes">Book tickets</Link>
      </section>
    </main>
  );
}
