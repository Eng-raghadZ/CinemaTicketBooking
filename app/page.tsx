import Homepage from "@/components/homepage";
import {
  getCurrentUserContext,
  createServerSupabaseClient,
} from "@/lib/auth/server";
import { isShowtimeOngoingOrUpcoming } from "@/lib/catalog/browse-query";
export const metadata = { title: "Moviera Cinema" };
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? await getCurrentUserContext()
      : null;
  const db =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? await createServerSupabaseClient()
      : null;
  const [films, venues, upcoming] = db
    ? await Promise.all([
        db
          .from("showtimes")
          .select(
            "starts_at,movies:movie_id(id,title,description,poster_url,hero_image_url,trailer_url,duration_minutes,rating),cinemas:cinema_id!inner(status)",
          )
          .eq("cinemas.status", "approved")
          .gte(
            "starts_at",
            new Date(Date.now() - 1000 * 60 * 1000).toISOString(),
          )
          .order("starts_at")
          .limit(100),
        db
          .from("cinemas")
          .select("id,name,location,cover_image_url")
          .eq("status", "approved")
          .order("name")
          .limit(100),
        db
          .from("showtimes")
          .select(
            "id,starts_at,base_price,currency_code,movies:movie_id(id,title,description,poster_url,hero_image_url,trailer_url,duration_minutes,rating),cinemas:cinema_id!inner(id,name,status),screens:screen_id(name)",
          )
          .eq("cinemas.status", "approved")
          .gt("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(20),
      ])
    : [{ data: null }, { data: null }, { data: null }];
  type Film = {
    id: string;
    title: string;
    description: string | null;
    poster_url: string | null;
    hero_image_url: string | null;
    trailer_url: string | null;
    duration_minutes: number;
    rating: string | null;
  };
  type UpcomingShowtime = {
    id: string;
    starts_at: string;
    base_price: string;
    currency_code: string;
    movies: Film | null;
    cinemas: { id: string; name: string } | null;
    screens: { name: string } | null;
  };
  const rows = (films.data ?? []) as unknown as {
    starts_at: string;
    movies: Film | null;
  }[];
  const now = new Date();
  const activeRows = rows.filter(
    (row) =>
      row.movies &&
      new Date(row.starts_at).getTime() <= now.getTime() &&
      isShowtimeOngoingOrUpcoming(
        row.starts_at,
        row.movies.duration_minutes,
        now,
      ),
  );
  const unique = Array.from(
    new Map(
      activeRows.flatMap((row) =>
        row.movies ? [[row.movies.id, row.movies] as const] : [],
      ),
    ).values(),
  );
  const upcomingRows = (upcoming.data ?? []) as unknown as UpcomingShowtime[];
  const heroMovies = Array.from(
    new Map(
      upcomingRows.flatMap((row) =>
        row.movies
          ? [
              [
                row.movies.id,
                { ...row.movies, next_showtime: row.starts_at },
              ] as const,
            ]
          : [],
      ),
    ).values(),
  );
  return (
    <Homepage
      email={user?.email ?? null}
      liveMovies={unique}
      heroMovies={heroMovies}
      liveCinemas={venues.data ?? []}
      upcomingShowtimes={upcomingRows}
    />
  );
}
