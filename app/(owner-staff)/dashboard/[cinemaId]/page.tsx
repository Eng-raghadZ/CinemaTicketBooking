import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { SignOutButton } from "@/app/(auth)/sign-out-button";

type CinemaDashboardPageProps = {
  params: Promise<{ cinemaId: string }>;
};

export default async function CinemaDashboardPage({
  params,
}: CinemaDashboardPageProps) {
  const { cinemaId } = await params;

  await requireCinemaStaff(cinemaId);

  const supabase = await createServerSupabaseClient();
  const { data: cinema, error } = await supabase
    .from("cinemas")
    .select("id, name, status, rejection_reason")
    .eq("id", cinemaId)
    .single();

  if (error || !cinema) {
    notFound();
  }

  return (
    <main>
      <h1>{cinema.name}</h1>

      <p>
        Review status: <strong>{cinema.status}</strong>
      </p>

      {cinema.status === "pending_review" && (
        <p>Your cinema is waiting for platform administrator review.</p>
      )}

      {cinema.status === "rejected" && cinema.rejection_reason && (
        <p role="alert">Rejection reason: {cinema.rejection_reason}</p>
      )}

      {cinema.status === "approved" && (
        <p>Your cinema has been approved.</p>
      )}

      {cinema.status === "suspended" && (
        <p role="alert">This cinema is currently suspended.</p>
      )}

      <nav aria-label="Cinema management">
        <Link href={`/dashboard/${cinema.id}/staff`}>Manage staff</Link>
        {" | "}
        <Link href={`/dashboard/${cinema.id}/movies`}>Movies</Link>
        {" | "}
        <Link href={`/dashboard/${cinema.id}/screens`}>Screens</Link>
        {" | "}
        <Link href={`/dashboard/${cinema.id}/showtimes`}>Showtimes</Link>
      </nav>

      <p>
        <Link href="/dashboard">Back to your cinemas</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
