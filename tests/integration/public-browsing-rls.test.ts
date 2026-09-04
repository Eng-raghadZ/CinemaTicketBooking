import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, asUser } from "./db-helper";

/**
 * Phase 3 (Customer Browsing) integration coverage. Every test here goes
 * through the `anon` Postgres role via the existing `asUser` helper — the
 * same mechanism PostgREST uses for an unauthenticated visitor — so these
 * tests prove the DATABASE (RLS from 0005_rls_policies.sql + grants from
 * 0007_roles_and_grants.sql) is what enforces public-browsing visibility,
 * not just that the app-layer queries in app/(public)/* happen to filter
 * correctly.
 *
 * CORRECTION (post-review): the original Phase 3 pass concluded no new
 * migration was needed. Running these tests against real Postgres surfaced
 * two defects that conclusion missed:
 *   1. Three tests below wrongly expected cinema_staff/audit_logs/users
 *      queries to "succeed and return zero rows" — those tables have no
 *      `anon` SELECT grant at all, so the correct, intended outcome is a
 *      table-level permission-denied error, not a filtered empty result.
 *      Fixed by asserting rejection instead.
 *   2. A genuine functional defect: `screens` (and transitively `seats`)
 *      failed for `anon` even for an APPROVED cinema, because
 *      can_manage_catalog()'s EXECUTE privilege was never granted to
 *      `anon` and gets evaluated during SELECT anyway (RLS's combined-OR
 *      quals across a `for all` policy are not guaranteed to
 *      short-circuit). Fixed by
 *      0014_public_screens_seats_read_fix.sql — see that migration and
 *      the tests below for the full reasoning. See
 *      docs/phase3-customer-browsing.md for the corrected account.
 *
 * Self-contained fixtures (own IDs), following the same pattern as
 * tests/integration/catalog-permissions-rls.test.ts, kept separate from
 * tests/integration/rls-and-constraints.test.ts so each file stays focused.
 */

const admin = adminSql();

const ADMIN_USER = "00000000-0000-0000-0000-00000000e001";
const OWNER_APPROVED = "00000000-0000-0000-0000-00000000e0a1";
const OWNER_PENDING = "00000000-0000-0000-0000-00000000e0b1";

let CINEMA_APPROVED: string;
let CINEMA_PENDING: string;
let CINEMA_SUSPENDED: string;
let SCREEN_APPROVED: string;
let MOVIE_AT_APPROVED: string;
let MOVIE_ONLY_AT_PENDING: string;
let SHOWTIME_APPROVED_FUTURE: string;
let SHOWTIME_APPROVED_PAST: string;
let SHOWTIME_PENDING_CINEMA: string;

async function resetFixtures() {
  await admin.unsafe(`
    truncate table
      audit_logs, notifications, payments, booking_seats, bookings, seat_holds,
      cinema_cancellation_policies, platform_policy_limits,
      showtimes, cinema_movies, movies, seats, screens,
      cinema_staff, cinemas, user_roles, users
    restart identity cascade
  `);

  await admin`
    insert into users (id, email, full_name) values
      (${ADMIN_USER}, 'admin@phase3.test', 'Platform Admin'),
      (${OWNER_APPROVED}, 'owner-approved@phase3.test', 'Owner Approved'),
      (${OWNER_PENDING}, 'owner-pending@phase3.test', 'Owner Pending')
  `;

  await admin`
    insert into user_roles (user_id, role) values
      (${ADMIN_USER}, 'platform_admin'),
      (${OWNER_APPROVED}, 'cinema_owner'),
      (${OWNER_PENDING}, 'cinema_owner')
  `;

  const [approved] = await admin`
    insert into cinemas (primary_owner_id, name, location, country_code, currency_code, status)
    values (${OWNER_APPROVED}, 'Riverside Cinema', 'Downtown', 'US', 'USD', 'approved')
    returning id
  `;
  const [pending] = await admin`
    insert into cinemas (primary_owner_id, name, location, country_code, currency_code, status)
    values (${OWNER_PENDING}, 'Unlaunched Cinema', 'Uptown', 'US', 'USD', 'pending_review')
    returning id
  `;
  const [suspended] = await admin`
    insert into cinemas (primary_owner_id, name, location, country_code, currency_code, status)
    values (${OWNER_APPROVED}, 'Closed Cinema', 'Midtown', 'US', 'USD', 'suspended')
    returning id
  `;
  CINEMA_APPROVED = approved.id;
  CINEMA_PENDING = pending.id;
  CINEMA_SUSPENDED = suspended.id;

  const [screen] = await admin`
    insert into screens (cinema_id, name) values (${CINEMA_APPROVED}, 'Screen 1') returning id
  `;
  SCREEN_APPROVED = screen.id;

  const [movieAtApproved] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Public Test Movie', 110, ${ADMIN_USER}) returning id
  `;
  const [movieOnlyAtPending] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Unlaunched Only Movie', 95, ${ADMIN_USER}) returning id
  `;
  MOVIE_AT_APPROVED = movieAtApproved.id;
  MOVIE_ONLY_AT_PENDING = movieOnlyAtPending.id;

  await admin`
    insert into cinema_movies (cinema_id, movie_id, added_by) values
      (${CINEMA_APPROVED}, ${MOVIE_AT_APPROVED}, ${OWNER_APPROVED}),
      (${CINEMA_PENDING}, ${MOVIE_ONLY_AT_PENDING}, ${OWNER_PENDING})
  `;

  const [futureShowtime] = await admin`
    insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
    values (${CINEMA_APPROVED}, ${SCREEN_APPROVED}, ${MOVIE_AT_APPROVED}, now() + interval '3 days', 12.00, 'USD')
    returning id
  `;
  const [pastShowtime] = await admin`
    insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
    values (${CINEMA_APPROVED}, ${SCREEN_APPROVED}, ${MOVIE_AT_APPROVED}, now() - interval '3 days', 12.00, 'USD')
    returning id
  `;
  SHOWTIME_APPROVED_FUTURE = futureShowtime.id;
  SHOWTIME_APPROVED_PAST = pastShowtime.id;

  const [pendingScreen] = await admin`
    insert into screens (cinema_id, name) values (${CINEMA_PENDING}, 'Screen P1') returning id
  `;
  const [pendingShowtime] = await admin`
    insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
    values (${CINEMA_PENDING}, ${pendingScreen.id}, ${MOVIE_ONLY_AT_PENDING}, now() + interval '3 days', 9.00, 'USD')
    returning id
  `;
  SHOWTIME_PENDING_CINEMA = pendingShowtime.id;
}

beforeAll(async () => {
  await resetFixtures();
});

beforeEach(async () => {
  await resetFixtures();
});

afterAll(async () => {
  await admin.end();
});

describe("Public cinema visibility (anon role)", () => {
  it("an approved cinema is visible to an anonymous visitor", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_APPROVED}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a pending_review cinema is NOT visible to an anonymous visitor", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_PENDING}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a suspended cinema is NOT visible to an anonymous visitor", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_SUSPENDED}`,
    );
    expect(rows).toHaveLength(0);
  });

  // cinema_staff, audit_logs, and users are NOT publicly-readable tables at
  // all — 0007_roles_and_grants.sql never grants `anon` SELECT on any of
  // them. That means the query is rejected at the table-grant level,
  // BEFORE Postgres ever evaluates row-level security: the correct,
  // intended failure mode is a table-level "permission denied" error, not
  // a successful query that RLS happens to filter down to zero rows. (A
  // zero-row *result* would actually be the wrong signal here — it would
  // mean the table was readable and only RLS was hiding the rows, which is
  // a weaker guarantee than what's actually configured. Asserting the
  // rejection itself is what proves the table-grant boundary exists.)
  it("an anonymous visitor is rejected at the table-grant level reading cinema_staff (never expose staff/permissions data)", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) => tx`select id from cinema_staff where cinema_id = ${CINEMA_APPROVED}`),
    ).rejects.toThrow(/permission denied for table cinema_staff/i);
  });

  it("an anonymous visitor is rejected at the table-grant level reading audit_logs", async () => {
    await expect(asUser({ role: "anon" }, (tx) => tx`select id from audit_logs`)).rejects.toThrow(
      /permission denied for table audit_logs/i,
    );
  });

  it("an anonymous visitor is rejected at the table-grant level reading users (users table stays completely private)", async () => {
    await expect(asUser({ role: "anon" }, (tx) => tx`select id from users`)).rejects.toThrow(
      /permission denied for table users/i,
    );
  });
});

describe("Public movie / cinema_movies visibility (anon role)", () => {
  it("a movie offered at an approved cinema is visible via cinema_movies", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select movie_id from cinema_movies where cinema_id = ${CINEMA_APPROVED} and movie_id = ${MOVIE_AT_APPROVED}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a cinema_movies row belonging to a pending cinema is NOT visible to anon", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select movie_id from cinema_movies where cinema_id = ${CINEMA_PENDING}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("the master movies table itself remains world-readable (admin catalog, not sensitive) — Phase 3's narrower 'offered by an approved cinema' rule is enforced at the app-query layer via cinema_movies, not by movies RLS", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from movies where id = ${MOVIE_ONLY_AT_PENDING}`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("Public showtime visibility (anon role)", () => {
  it("a showtime at an approved cinema is visible to anon", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from showtimes where id = ${SHOWTIME_APPROVED_FUTURE}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a showtime belonging to a non-approved cinema is NOT visible to anon", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from showtimes where id = ${SHOWTIME_PENDING_CINEMA}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a past showtime at an approved cinema is still readable at the RLS layer (the app's 'upcoming' filter is a query-time WHERE clause, not a security boundary)", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from showtimes where id = ${SHOWTIME_APPROVED_PAST}`,
    );
    expect(rows).toHaveLength(1);
  });

  // screens_write_manage_screens (0013) is a `for all` policy, so its
  // USING clause — which calls can_manage_catalog(cinema_id,
  // 'manage_screens') — is combined via OR with screens_select_public's
  // qual for EVERY SELECT, not just writes. can_manage_catalog's EXECUTE
  // privilege was revoked from PUBLIC in 0013 and only re-granted to
  // authenticated/service_role, so without 0014's anon grant this query
  // failed with "permission denied for function can_manage_catalog" even
  // though screens_select_public alone already makes the row visible —
  // Postgres does not guarantee short-circuiting across combined RLS
  // quals. See 0014_public_screens_seats_read_fix.sql for the fix and full
  // reasoning.
  it("screens for an approved cinema are visible to anon (needed to display the screen name on a showtime)", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from screens where id = ${SCREEN_APPROVED}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("screens for a NON-approved cinema remain invisible to anon (the grant fix only enables evaluation, not a true result, for an anonymous caller)", async () => {
    const [pendingScreen] = await admin`select id from screens where cinema_id = ${CINEMA_PENDING}`;
    const rows = await asUser({ role: "anon" }, (tx) => tx`select id from screens where id = ${pendingScreen.id}`);
    expect(rows).toHaveLength(0);
  });

  // Same combined-OR shape as screens (seats_write_manage_screens is also
  // `for all` and also calls can_manage_catalog, via a subquery joining
  // screens) — regression coverage for the identical bug pattern on a
  // second table, fixed by the same 0014 grant.
  it("seats for an approved cinema's screen are visible to anon", async () => {
    await admin`insert into seats (screen_id, row, number) values (${SCREEN_APPROVED}, 'A', 1)`;
    const rows = await asUser({ role: "anon" }, (tx) => tx`select id from seats where screen_id = ${SCREEN_APPROVED}`);
    expect(rows).toHaveLength(1);
  });

  it("an anonymous visitor cannot gain catalog-management capability through the can_manage_catalog grant (it always evaluates false for anon)", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select can_manage_catalog(${CINEMA_APPROVED}::uuid, 'manage_screens') as can_manage`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].can_manage).toBe(false);
  });

  it("an anonymous visitor cannot write to showtimes (public browsing is read-only)", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) =>
        tx`update showtimes set base_price = 0.01 where id = ${SHOWTIME_APPROVED_FUTURE}`,
      ),
    ).rejects.toThrow();
  });
});

// Requirement: anon must not insert, update, or delete screens, showtimes,
// movies, or cinema_movies associations. The showtimes UPDATE case is
// covered above; this block covers the remaining three tables explicitly,
// including screens specifically — the exact table the 0014 read-fix
// touches — to prove the read-side grant fix did not also loosen any
// write-side boundary.
describe("Public browsing remains read-only for anon (0014's read grant did not loosen writes)", () => {
  it("cannot insert a screen for an approved cinema", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_APPROVED}, 'Anon Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("cannot update a screen for an approved cinema", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) => tx`update screens set name = 'Hacked' where id = ${SCREEN_APPROVED}`),
    ).rejects.toThrow();
  });

  it("cannot delete a screen for an approved cinema", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) => tx`delete from screens where id = ${SCREEN_APPROVED}`),
    ).rejects.toThrow();
  });

  it("cannot insert a movie into the master catalog", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) =>
        tx`insert into movies (title, duration_minutes, created_by) values ('Anon Movie', 90, ${ADMIN_USER})`,
      ),
    ).rejects.toThrow();
  });

  it("cannot add a cinema_movies association", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) =>
        tx`insert into cinema_movies (cinema_id, movie_id, added_by) values (${CINEMA_APPROVED}, ${MOVIE_ONLY_AT_PENDING}, ${ADMIN_USER})`,
      ),
    ).rejects.toThrow();
  });

  it("cannot remove an existing cinema_movies association", async () => {
    await expect(
      asUser({ role: "anon" }, (tx) =>
        tx`delete from cinema_movies where cinema_id = ${CINEMA_APPROVED} and movie_id = ${MOVIE_AT_APPROVED}`,
      ),
    ).rejects.toThrow();
  });
});
