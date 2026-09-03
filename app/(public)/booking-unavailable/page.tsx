import Link from "next/link";

/**
 * Placeholder destination for the "Select seats" action on a showtime.
 * Seat holds, seat maps, and booking creation are explicitly Phase 4 work
 * (docs/architecture-plan.md) — this page exists so Phase 3 has a real,
 * clearly-labeled navigation target instead of a dead link or a
 * half-built booking flow. Nothing here reads or writes seat_holds/
 * bookings.
 */
export default async function BookingUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ showtimeId?: string }>;
}) {
  const { showtimeId } = await searchParams;

  return (
    <main>
      <h1>Seat selection is coming soon</h1>
      <p>
        Booking and seat selection haven&apos;t been built yet — this is a placeholder for a
        future release.
      </p>
      {showtimeId && (
        <p>
          <Link href={`/showtimes/${showtimeId}`}>Back to showtime details</Link>
        </p>
      )}
      <p>
        <Link href="/showtimes">Browse other showtimes</Link>
      </p>
    </main>
  );
}
