import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  buildContainsPattern,
  firstParam,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  totalPages,
} from "@/lib/catalog/browse-query";

interface CinemaSummary {
  id: string;
  name: string;
  location: string | null;
  country_code: string;
  currency_code: string;
}

export const metadata = { title: "Browse cinemas" };

/**
 * Public cinema directory. Relies on `cinemas_select_public_approved`
 * (supabase/migrations/0005_rls_policies.sql) as the actual security
 * boundary — the explicit `.eq("status", "approved")` below is
 * belt-and-suspenders, matching the layered-defense pattern documented in
 * docs/security.md, not the thing actually doing the hiding.
 */
export default async function PublicCinemasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseSearchParam(firstParam(params.q));
  const page = parsePageParam(firstParam(params.page));
  const [from, to] = rangeForPage(page);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("cinemas")
    .select("id, name, location, country_code, currency_code", { count: "exact" })
    .eq("status", "approved")
    .order("name", { ascending: true })
    .range(from, to);

  if (q) {
    query = query.ilike("name", buildContainsPattern(q));
  }

  const { data, count, error } = await query;
  const cinemas = (data ?? []) as CinemaSummary[];
  const pages = totalPages(count ?? 0);

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(targetPage));
    return `/cinemas?${sp.toString()}`;
  };

  return (
    <main>
      <h1>Cinemas</h1>

      <form method="get">
        <label>
          Search by name
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="e.g. Riverside" />
        </label>
        <button type="submit">Search</button>
      </form>

      {error && <p role="alert">Could not load cinemas right now. Please try again.</p>}

      {!error && cinemas.length === 0 && (
        <p>
          {q ? `No approved cinemas match "${q}".` : "No approved cinemas are available yet."}
        </p>
      )}

      {cinemas.length > 0 && (
        <ul>
          {cinemas.map((cinema) => (
            <li key={cinema.id}>
              <Link href={`/cinemas/${cinema.id}`}>{cinema.name}</Link>
              {cinema.location ? ` — ${cinema.location}` : ""} ({cinema.country_code})
            </li>
          ))}
        </ul>
      )}

      {cinemas.length > 0 && (
        <nav aria-label="Pagination">
          {page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}{" "}
          <span>
            Page {page} of {pages}
          </span>{" "}
          {page < pages && <Link href={pageHref(page + 1)}>Next</Link>}
        </nav>
      )}
    </main>
  );
}
