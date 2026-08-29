import { notFound } from "next/navigation";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { hasMinCinemaStaffRole } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import { ScreenForm } from "./screen-form";

interface ScreenRow {
  id: string;
  name: string;
  layout_config: { rows?: number; seatsPerRow?: number; seatType?: string } | null;
  created_at: string;
}

export default async function CinemaScreensPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  const { cinemaId } = await params;
  const { role } = await requireCinemaStaff(cinemaId);
  const canManage = hasMinCinemaStaffRole({ role, status: "active" }, "manager");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("screens")
    .select("id, name, layout_config, created_at")
    .eq("cinema_id", cinemaId)
    .order("created_at", { ascending: true });

  if (error) notFound();
  const screens = (data ?? []) as ScreenRow[];

  return (
    <main>
      <h1>Screens</h1>
      <SignOutButton />

      <section>
        <h2>Existing screens ({screens.length})</h2>
        {screens.length === 0 ? (
          <p>No screens yet.</p>
        ) : (
          <ul>
            {screens.map((screen) => {
              const rows = screen.layout_config?.rows;
              const seatsPerRow = screen.layout_config?.seatsPerRow;
              const total = rows && seatsPerRow ? rows * seatsPerRow : undefined;
              return (
                <li key={screen.id}>
                  <strong>{screen.name}</strong>
                  {rows && seatsPerRow ? (
                    <> — {rows} rows × {seatsPerRow} seats ({total} total, {screen.layout_config?.seatType})</>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage ? (
        <section>
          <h2>Create a new screen</h2>
          <p>The seat grid is generated automatically from the rows/seats you choose.</p>
          <ScreenForm cinemaId={cinemaId} />
        </section>
      ) : (
        <p>Only the cinema owner or a manager can create screens.</p>
      )}
    </main>
  );
}
