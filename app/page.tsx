import Homepage from "@/components/homepage";
import { getCurrentUserContext, createServerSupabaseClient } from "@/lib/auth/server";
export const metadata = { title: "Moviera Cinema" };
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const user = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? await getCurrentUserContext() : null;
  const db = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? await createServerSupabaseClient() : null;
  const [films, venues] = db ? await Promise.all([
    db.from("showtimes").select("movies:movie_id(id,title,poster_url,duration_minutes,rating),cinemas:cinema_id!inner(status)").eq("cinemas.status", "approved").gte("starts_at", new Date().toISOString()).order("starts_at").limit(100),
    db.from("cinemas").select("id,name,location").eq("status", "approved").order("name").limit(100),
  ]) : [{ data: null }, { data: null }];
  type Film = { id: string; title: string; poster_url: string | null; duration_minutes: number; rating: string | null };
  const rows = (films.data ?? []) as unknown as { movies: Film | null }[];
  const unique = Array.from(new Map(rows.flatMap(row => row.movies ? [[row.movies.id, row.movies] as const] : [])).values()).slice(0, 5);
  return <Homepage email={user?.email ?? null} liveMovies={unique} liveCinemas={venues.data ?? []} />;
}
