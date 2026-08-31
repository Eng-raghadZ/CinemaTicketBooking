import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, asUser } from "./db-helper";

/**
 * Dedicated integration coverage for Phase 2's catalog-permission hardening
 * (supabase/migrations/0013_catalog_permission_enforcement.sql). This file
 * is self-contained — its own fixtures, its own IDs — deliberately kept
 * separate from tests/integration/rls-and-constraints.test.ts (which
 * already covers Phase 0/1 and the coarse Phase 2 movies/cinema_movies
 * checks) rather than folding these into that file, so each file stays
 * focused on what it's actually verifying.
 *
 * Every test here exercises real RLS through the caller's own simulated
 * session (asUser), never a service-role bypass — the point is to prove
 * the DATABASE agrees with what the application layer
 * (lib/auth/guards.ts's requireCinemaCatalogPermission) already enforces,
 * not just that the Server Actions have the right code path.
 */

const admin = adminSql();

// Fixture IDs.
const ADMIN_USER = "00000000-0000-0000-0000-00000000d001";
const OWNER_A = "00000000-0000-0000-0000-00000000d0a1";
const OWNER_B = "00000000-0000-0000-0000-00000000d0b1";

// All five are 'manager' on Cinema A, differing only in which catalog
// permission (if any) is granted — this is what proves permission
// separation, not just "manager vs owner".
const MANAGER_ALL_PERMS = "00000000-0000-0000-0000-00000000d101";
const MANAGER_SCREENS_ONLY = "00000000-0000-0000-0000-00000000d102";
const MANAGER_SHOWTIMES_ONLY = "00000000-0000-0000-0000-00000000d103";
const MANAGER_PRICING_ONLY = "00000000-0000-0000-0000-00000000d104";
const MANAGER_NO_CATALOG_PERMS = "00000000-0000-0000-0000-00000000d105";

let CINEMA_A: string;
let CINEMA_B: string;
let SCREEN_A: string;
let SCREEN_A2: string;
let SCREEN_B: string;
let MOVIE_1: string;
let MOVIE_2: string;
let MOVIE_NOT_IN_CINEMA_A_CATALOG: string;
let SHOWTIME_A: string;

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
      (${ADMIN_USER}, 'admin@phase2.test', 'Platform Admin'),
      (${OWNER_A}, 'ownerA@phase2.test', 'Owner A'),
      (${OWNER_B}, 'ownerB@phase2.test', 'Owner B'),
      (${MANAGER_ALL_PERMS}, 'mgr-all@phase2.test', 'Manager All Perms'),
      (${MANAGER_SCREENS_ONLY}, 'mgr-screens@phase2.test', 'Manager Screens Only'),
      (${MANAGER_SHOWTIMES_ONLY}, 'mgr-showtimes@phase2.test', 'Manager Showtimes Only'),
      (${MANAGER_PRICING_ONLY}, 'mgr-pricing@phase2.test', 'Manager Pricing Only'),
      (${MANAGER_NO_CATALOG_PERMS}, 'mgr-none@phase2.test', 'Manager No Catalog Perms')
  `;

  await admin`
    insert into user_roles (user_id, role) values
      (${ADMIN_USER}, 'platform_admin'),
      (${OWNER_A}, 'cinema_owner'),
      (${OWNER_B}, 'cinema_owner'),
      (${MANAGER_ALL_PERMS}, 'cinema_staff'),
      (${MANAGER_SCREENS_ONLY}, 'cinema_staff'),
      (${MANAGER_SHOWTIMES_ONLY}, 'cinema_staff'),
      (${MANAGER_PRICING_ONLY}, 'cinema_staff'),
      (${MANAGER_NO_CATALOG_PERMS}, 'cinema_staff')
  `;

  const [cinemaA] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_A}, 'Cinema A', 'US', 'USD', 'approved')
    returning id
  `;
  const [cinemaB] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_B}, 'Cinema B', 'US', 'USD', 'approved')
    returning id
  `;
  CINEMA_A = cinemaA.id;
  CINEMA_B = cinemaB.id;
  // 0008's bootstrap trigger already gave OWNER_A/OWNER_B an active
  // 'owner' cinema_staff row for their own cinema automatically.

  await admin`
    insert into cinema_staff (cinema_id, user_id, role, status, permissions) values
      (${CINEMA_A}, ${MANAGER_ALL_PERMS}, 'manager', 'active',
        '{"manage_screens": true, "manage_showtimes": true, "manage_pricing": true}'::jsonb),
      (${CINEMA_A}, ${MANAGER_SCREENS_ONLY}, 'manager', 'active',
        '{"manage_screens": true}'::jsonb),
      (${CINEMA_A}, ${MANAGER_SHOWTIMES_ONLY}, 'manager', 'active',
        '{"manage_showtimes": true}'::jsonb),
      (${CINEMA_A}, ${MANAGER_PRICING_ONLY}, 'manager', 'active',
        '{"manage_pricing": true}'::jsonb),
      (${CINEMA_A}, ${MANAGER_NO_CATALOG_PERMS}, 'manager', 'active',
        '{"manage_staff": true}'::jsonb)
  `;

  const [screenA] = await admin`
    insert into screens (cinema_id, name, layout_config)
    values (${CINEMA_A}, 'Screen A1', '{"rows":1,"seatsPerRow":1,"seatType":"standard"}'::jsonb)
    returning id
  `;
  // A second screen on the SAME cinema (Cinema A) — needed to test that a
  // 'manage_pricing'-only manager can't reassign a showtime's screen_id
  // even within their own cinema, distinct from the cross-cinema isolation
  // tests below which use SCREEN_B on a different cinema entirely.
  const [screenA2] = await admin`
    insert into screens (cinema_id, name, layout_config)
    values (${CINEMA_A}, 'Screen A2', '{"rows":1,"seatsPerRow":1,"seatType":"standard"}'::jsonb)
    returning id
  `;
  const [screenB] = await admin`
    insert into screens (cinema_id, name, layout_config)
    values (${CINEMA_B}, 'Screen B1', '{"rows":1,"seatsPerRow":1,"seatType":"standard"}'::jsonb)
    returning id
  `;
  SCREEN_A = screenA.id;
  SCREEN_A2 = screenA2.id;
  SCREEN_B = screenB.id;

  const [movie1] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Phase 2 Test Movie', 100, ${ADMIN_USER}) returning id
  `;
  const [movie2] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Phase 2 Second Test Movie', 90, ${ADMIN_USER}) returning id
  `;
  // Exists in the master catalog (so its FK is valid) but deliberately
  // never added to Cinema A's cinema_movies — needed to prove
  // enforce_showtime_insert_integrity() rejects scheduling a movie the
  // cinema never selected, independent of whether the movie is globally
  // real.
  const [movieNotInCatalog] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Phase 2 Movie Not In Cinema A Catalog', 100, ${ADMIN_USER}) returning id
  `;
  MOVIE_1 = movie1.id;
  MOVIE_2 = movie2.id;
  MOVIE_NOT_IN_CINEMA_A_CATALOG = movieNotInCatalog.id;

  await admin`
    insert into cinema_movies (cinema_id, movie_id, added_by)
    values (${CINEMA_A}, ${MOVIE_1}, ${OWNER_A}), (${CINEMA_A}, ${MOVIE_2}, ${OWNER_A})
  `;

  const [showtimeA] = await admin`
    insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
    values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '2 days', 10.00, 'USD')
    returning id
  `;
  SHOWTIME_A = showtimeA.id;
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

// ---------------------------------------------------------------------------
// CROSS-CINEMA ISOLATION
// ---------------------------------------------------------------------------

describe("Cross-cinema isolation for Phase 2 catalog resources", () => {
  it("a manager with full catalog permissions on Cinema A cannot create a screen on Cinema B", async () => {
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_B}, 'Hack Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with full catalog permissions on Cinema A cannot add seats to Cinema B's screen", async () => {
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`insert into seats (screen_id, row, number) values (${SCREEN_B}, 'A', 1)`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with full catalog permissions on Cinema A cannot create a showtime on Cinema B", async () => {
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_B}, ${SCREEN_B}, ${MOVIE_1}, now() + interval '3 days', 5.00, 'USD')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with full catalog permissions on Cinema A cannot add a movie to Cinema B's catalog", async () => {
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`insert into cinema_movies (cinema_id, movie_id, added_by)
           values (${CINEMA_B}, ${MOVIE_1}, ${MANAGER_ALL_PERMS})`,
      ),
    ).rejects.toThrow();
  });

  it("an owner/manager can remove a movie from their OWN cinema's catalog (proves the DELETE grant fix works for cinema_movies too)", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`delete from cinema_movies where cinema_id = ${CINEMA_A} and movie_id = ${MOVIE_1} returning movie_id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a manager cannot remove a movie from Cinema B's catalog", async () => {
    await admin`insert into cinema_movies (cinema_id, movie_id, added_by) values (${CINEMA_B}, ${MOVIE_1}, ${OWNER_B})`;
    const rows = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`delete from cinema_movies where cinema_id = ${CINEMA_B} and movie_id = ${MOVIE_1} returning movie_id`,
    );
    expect(rows).toHaveLength(0);

    const [stillThere] = await admin`select movie_id from cinema_movies where cinema_id = ${CINEMA_B}`;
    expect(stillThere).toBeDefined();
  });

  it("a manager with full catalog permissions on Cinema A cannot delete Cinema B's showtime", async () => {
    const [otherShowtime] = await admin`
      insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
      values (${CINEMA_B}, ${SCREEN_B}, ${MOVIE_1}, now() + interval '4 days', 8.00, 'USD')
      returning id
    `;
    const rows = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`delete from showtimes where id = ${otherShowtime.id} returning id`,
    );
    expect(rows).toHaveLength(0); // RLS hides the row entirely — 0 rows affected, not an error
  });

  it("a manager with full catalog permissions on Cinema A cannot change Cinema B's showtime price", async () => {
    const [otherShowtime] = await admin`
      insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
      values (${CINEMA_B}, ${SCREEN_B}, ${MOVIE_1}, now() + interval '4 days', 8.00, 'USD')
      returning id
    `;
    const rows = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`update showtimes set base_price = 0.01 where id = ${otherShowtime.id} returning id`,
    );
    expect(rows).toHaveLength(0);

    const [unchanged] = await admin`select base_price from showtimes where id = ${otherShowtime.id}`;
    expect(unchanged.base_price).toBe("8.00");
  });
});

// ---------------------------------------------------------------------------
// SCREENS — requires 'manage_screens'
// ---------------------------------------------------------------------------

describe("Screen management requires 'manage_screens'", () => {
  it("a manager WITH manage_screens can create a screen for their own cinema", async () => {
    const rows = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'New Screen') returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a manager WITH manage_screens can add seats to their own cinema's screen", async () => {
    const rows = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`insert into seats (screen_id, row, number) values (${SCREEN_A}, 'Z', 9) returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a manager WITHOUT manage_screens cannot create a screen, even for their own cinema", async () => {
    await expect(
      asUser({ userId: MANAGER_NO_CATALOG_PERMS }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Denied Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with ONLY manage_showtimes cannot create a screen", async () => {
    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Denied Screen 2')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with ONLY manage_pricing cannot create a screen", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Denied Screen 3')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager WITH manage_screens can delete a screen for their own cinema (proves the DELETE grant fix in this migration works, not just INSERT)", async () => {
    const [screenToDelete] = await admin`
      insert into screens (cinema_id, name) values (${CINEMA_A}, 'Temp Screen') returning id
    `;
    const rows = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`delete from screens where id = ${screenToDelete.id} returning id`,
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// SCREEN DELETE MUST NOT INDIRECTLY DELETE SHOWTIMES (ON DELETE CASCADE
// closed by enforce_screen_delete_scope()). This is the first of the two
// findings from the third review pass: screens.write is gated on
// 'manage_screens' alone, and showtimes.screen_id -> screens(id) ON DELETE
// CASCADE (0001_core_schema.sql, unedited) — without a guard, deleting a
// screen would silently take its showtimes with it, achieving a
// showtime deletion without ever holding 'manage_showtimes'.
// ---------------------------------------------------------------------------

describe("Screen deletion must not indirectly delete showtimes (manage_screens does not imply manage_showtimes)", () => {
  it("a manager with ONLY manage_screens CAN delete a screen that has NO showtimes — required for compensation and ordinary cleanup", async () => {
    const rows = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`delete from screens where id = ${SCREEN_A2} returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("that same manager CANNOT delete a screen that has a showtime scheduled on it", async () => {
    await expect(
      asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
        tx`delete from screens where id = ${SCREEN_A} returning id`,
      ),
    ).rejects.toThrow(/cannot delete a screen that has showtimes scheduled/i);

    const [screenStillThere] = await admin`select id from screens where id = ${SCREEN_A}`;
    expect(screenStillThere).toBeDefined();
  });

  it("the referenced showtime remains fully intact after the rejected screen deletion", async () => {
    await expect(
      asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
        tx`delete from screens where id = ${SCREEN_A} returning id`,
      ),
    ).rejects.toThrow();

    const [showtimeStillThere] = await admin`
      select id, screen_id, base_price from showtimes where id = ${SHOWTIME_A}
    `;
    expect(showtimeStillThere).toBeDefined();
    expect(showtimeStillThere.screen_id).toBe(SCREEN_A);
    expect(showtimeStillThere.base_price).toBe("10.00");
  });

  it("holding BOTH manage_screens and manage_showtimes still does not permit deleting a busy screen directly — the showtime must be deleted first", async () => {
    // Deliberately proves the block is unconditional on manage_showtimes,
    // not just "you're missing a permission" — deleting a scheduled
    // showtime via its screen is not an intended path for ANYONE.
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`delete from screens where id = ${SCREEN_A} returning id`,
      ),
    ).rejects.toThrow(/cannot delete a screen that has showtimes scheduled/i);

    const [stillThere] = await admin`select id from showtimes where id = ${SHOWTIME_A}`;
    expect(stillThere).toBeDefined();
  });

  it("the correct sequence works: delete the showtime first (manage_showtimes), then the now-empty screen (manage_screens)", async () => {
    const deletedShowtime = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`delete from showtimes where id = ${SHOWTIME_A} returning id`,
    );
    expect(deletedShowtime).toHaveLength(1);

    const deletedScreen = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`delete from screens where id = ${SCREEN_A} returning id`,
    );
    expect(deletedScreen).toHaveLength(1);
  });

  it("an owner is equally blocked from deleting a busy screen directly (unconditional, not manager-specific)", async () => {
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`delete from screens where id = ${SCREEN_A} returning id`,
      ),
    ).rejects.toThrow(/cannot delete a screen that has showtimes scheduled/i);
  });

  it("platform_admin bypasses the guard and can delete a busy screen (cascading its showtime), consistent with the trusted-admin bypass used everywhere else", async () => {
    const rows = await asUser({ userId: ADMIN_USER, role: "authenticated" }, (tx) =>
      tx`delete from screens where id = ${SCREEN_A} returning id`,
    );
    expect(rows).toHaveLength(1);

    const [showtimeGone] = await admin`select id from showtimes where id = ${SHOWTIME_A}`;
    expect(showtimeGone).toBeUndefined(); // cascaded, as expected for the trusted admin path
  });
});

// ---------------------------------------------------------------------------
// SHOWTIMES (scheduling: insert/delete) — requires 'manage_showtimes'
// ---------------------------------------------------------------------------

describe("Showtime scheduling requires 'manage_showtimes'", () => {
  it("a manager WITH manage_showtimes can create a showtime for their own cinema", async () => {
    const rows = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '5 days', 12.00, 'USD')
         returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a manager WITH manage_showtimes can delete a showtime for their own cinema", async () => {
    const rows = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`delete from showtimes where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a manager WITHOUT manage_showtimes cannot create a showtime, even for their own cinema", async () => {
    await expect(
      asUser({ userId: MANAGER_NO_CATALOG_PERMS }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '6 days', 9.00, 'USD')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with ONLY manage_screens cannot create a showtime", async () => {
    await expect(
      asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '7 days', 9.00, 'USD')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with ONLY manage_pricing cannot create a showtime", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '7 days', 9.00, 'USD')`,
      ),
    ).rejects.toThrow();
  });

  it("a manager with ONLY manage_pricing cannot delete a showtime", async () => {
    const rows = await asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
      tx`delete from showtimes where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(0);

    const [stillThere] = await admin`select id from showtimes where id = ${SHOWTIME_A}`;
    expect(stillThere).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SHOWTIME INSERT MUST ENFORCE CROSS-TABLE INTEGRITY AT THE DATABASE LAYER
// (enforce_showtime_insert_integrity()). This is the second finding from
// the third review pass: showtimes_insert_manage_showtimes only checks
// that the caller has 'manage_showtimes' on the supplied cinema_id — it
// never verified that screen_id actually belongs to that cinema, that
// (cinema_id, movie_id) is really in cinema_movies, or that currency_code
// matches the cinema's own currency. lib/actions/showtimes.ts's
// createShowtime already checks all three, but a direct PostgREST INSERT
// (bypassing the Server Action entirely) previously would not have been
// caught by RLS alone. MANAGER_SHOWTIMES_ONLY is used throughout — the
// exact caller who legitimately passes the RLS permission check and must
// still be blocked by these integrity checks.
// ---------------------------------------------------------------------------

describe("Showtime INSERT enforces cross-table integrity at the database layer", () => {
  it("REJECTS an insert where screen_id belongs to a different cinema than cinema_id, even though the caller has manage_showtimes on that cinema_id", async () => {
    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_B}, ${MOVIE_1}, now() + interval '13 days', 12.00, 'USD')`,
      ),
    ).rejects.toThrow(/screen does not belong to the specified cinema/i);
  });

  it("the rejected cross-cinema-screen insert leaves no row behind", async () => {
    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_B}, ${MOVIE_1}, now() + interval '13 days', 12.00, 'USD')`,
      ),
    ).rejects.toThrow();

    const rows = await admin`
      select id from showtimes where cinema_id = ${CINEMA_A} and screen_id = ${SCREEN_B}
    `;
    expect(rows).toHaveLength(0);
  });

  it("REJECTS scheduling a movie that is not in this cinema's cinema_movies selection", async () => {
    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_NOT_IN_CINEMA_A_CATALOG}, now() + interval '13 days', 12.00, 'USD')`,
      ),
    ).rejects.toThrow(/not in this cinema's catalog/i);
  });

  it("a valid same-cinema screen + a movie actually selected in cinema_movies still succeeds", async () => {
    const rows = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A2}, ${MOVIE_2}, now() + interval '13 days', 12.00, 'USD')
         returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("REJECTS a currency_code that does not match the cinema's configured currency (Cinema A is USD)", async () => {
    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '13 days', 12.00, 'EUR')`,
      ),
    ).rejects.toThrow(/currency_code must match/i);
  });

  it("ACCEPTS the cinema's own currency_code — the happy path is not collaterally blocked", async () => {
    const rows = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '13 days', 12.00, 'USD')
         returning id, currency_code`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].currency_code).toBe("USD");
  });

  it("platform_admin bypasses all three integrity checks, consistent with the trusted-admin bypass used everywhere else in this migration", async () => {
    const rows = await asUser({ userId: ADMIN_USER, role: "authenticated" }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_B}, ${MOVIE_NOT_IN_CINEMA_A_CATALOG}, now() + interval '14 days', 12.00, 'EUR')
         returning id, currency_code`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].currency_code).toBe("EUR");
  });
});

// ---------------------------------------------------------------------------
// SHOWTIME PRICE (update) — requires 'manage_pricing'
// ---------------------------------------------------------------------------

describe("Showtime price changes require 'manage_pricing'", () => {
  it("a manager WITH manage_pricing can update the price of their own cinema's showtime", async () => {
    const rows = await asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
      tx`update showtimes set base_price = 15.50 where id = ${SHOWTIME_A} returning base_price`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].base_price).toBe("15.50");
  });

  it("a manager WITHOUT manage_pricing cannot update the price, even for their own cinema", async () => {
    const rows = await asUser({ userId: MANAGER_NO_CATALOG_PERMS }, (tx) =>
      tx`update showtimes set base_price = 99.99 where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(0);

    const [unchanged] = await admin`select base_price from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.base_price).toBe("10.00");
  });

  it("a manager with ONLY manage_showtimes cannot update the price — scheduling permission does not imply pricing", async () => {
    const rows = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`update showtimes set base_price = 77.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a manager with ONLY manage_screens cannot update the price", async () => {
    const rows = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`update showtimes set base_price = 66.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// COLUMN-LEVEL GUARD — RLS alone only restricts WHICH ROW a
// 'manage_pricing' manager may UPDATE, not WHICH COLUMNS. This is what
// enforce_showtime_update_scope() (the BEFORE UPDATE trigger added in
// 0013_catalog_permission_enforcement.sql) exists to close. Every test
// here uses MANAGER_PRICING_ONLY specifically — the exact caller who has
// legitimately passed showtimes_update_manage_pricing's RLS check and
// must still be blocked from touching scheduling fields.
// ---------------------------------------------------------------------------

describe("A 'manage_pricing'-only manager is restricted to the base_price column", () => {
  it("CAN update base_price alone", async () => {
    const rows = await asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
      tx`update showtimes set base_price = 42.00 where id = ${SHOWTIME_A} returning base_price`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].base_price).toBe("42.00");
  });

  it("CANNOT change starts_at", async () => {
    const newStart = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set starts_at = ${newStart} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select starts_at from showtimes where id = ${SHOWTIME_A}`;
    expect(new Date(unchanged.starts_at).toISOString()).not.toBe(newStart);
  });

  it("CANNOT change screen_id, even to another screen within the SAME cinema", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set screen_id = ${SCREEN_A2} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select screen_id from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.screen_id).toBe(SCREEN_A);
  });

  it("CANNOT change movie_id", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set movie_id = ${MOVIE_2} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select movie_id from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.movie_id).toBe(MOVIE_1);
  });

  it("CANNOT combine a valid price change with an unauthorized scheduling-field change in the same UPDATE", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set base_price = 55.00, screen_id = ${SCREEN_A2} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    // The whole statement must roll back — neither the (otherwise valid)
    // price change nor the screen change may partially apply.
    const [unchanged] = await admin`select base_price, screen_id from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.base_price).toBe("10.00");
    expect(unchanged.screen_id).toBe(SCREEN_A);
  });

  it("CANNOT combine a valid price change with a movie_id change in the same UPDATE", async () => {
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set base_price = 55.00, movie_id = ${MOVIE_2} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select base_price, movie_id from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.base_price).toBe("10.00");
    expect(unchanged.movie_id).toBe(MOVIE_1);
  });

  it("CANNOT change the showtime's id (primary key) — not just the enumerated scheduling columns", async () => {
    // The enumerated columns (starts_at/screen_id/movie_id/etc.) are the
    // obvious rescheduling vector, but `id` itself is a column like any
    // other and a caller could attempt to SET it directly. This is what
    // closes that specific gap in enforce_showtime_update_scope() — see
    // supabase/migrations/0013_catalog_permission_enforcement.sql.
    const attemptedNewId = "00000000-0000-0000-0000-00000000dfff";
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set id = ${attemptedNewId} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [stillOriginal] = await admin`select id from showtimes where id = ${SHOWTIME_A}`;
    expect(stillOriginal.id).toBe(SHOWTIME_A);

    const [shouldNotExist] = await admin`select id from showtimes where id = ${attemptedNewId}`;
    expect(shouldNotExist).toBeUndefined();
  });

  it("CANNOT combine a valid price change with an id change in the same UPDATE", async () => {
    const attemptedNewId = "00000000-0000-0000-0000-00000000dffe";
    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`update showtimes set base_price = 88.00, id = ${attemptedNewId} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select id, base_price from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.id).toBe(SHOWTIME_A);
    expect(unchanged.base_price).toBe("10.00");
  });

  it("base_price remains freely editable — the id check doesn't collaterally block the one allowed column", async () => {
    const rows = await asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
      tx`update showtimes set base_price = 19.99 where id = ${SHOWTIME_A} returning id, base_price`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(SHOWTIME_A);
    expect(rows[0].base_price).toBe("19.99");
  });
});

describe("The column-level guard applies to owners too (Phase 2 exposes no rescheduling to anyone), but platform_admin bypasses it", () => {
  it("the owner CAN update price", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`update showtimes set base_price = 33.00 where id = ${SHOWTIME_A} returning base_price`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].base_price).toBe("33.00");
  });

  it("the owner CANNOT change starts_at directly, matching the deliberate 'no rescheduling in Phase 2' decision", async () => {
    const newStart = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`update showtimes set starts_at = ${newStart} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);
  });

  it("the owner CANNOT change the showtime's id either, consistent with the same price-only rule", async () => {
    const attemptedNewId = "00000000-0000-0000-0000-00000000dffd";
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`update showtimes set id = ${attemptedNewId} where id = ${SHOWTIME_A}`,
      ),
    ).rejects.toThrow(/only base_price may be changed/i);

    const [unchanged] = await admin`select id from showtimes where id = ${SHOWTIME_A}`;
    expect(unchanged.id).toBe(SHOWTIME_A);
  });

  it("platform_admin CAN change starts_at/screen_id/movie_id — the trigger bypasses for the trusted admin role, matching every other trigger in this schema", async () => {
    const newStart = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await asUser({ userId: ADMIN_USER, role: "authenticated" }, (tx) =>
      tx`update showtimes
         set starts_at = ${newStart}, screen_id = ${SCREEN_A2}, movie_id = ${MOVIE_2}, base_price = 40.00
         where id = ${SHOWTIME_A}
         returning screen_id, movie_id, base_price`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].screen_id).toBe(SCREEN_A2);
    expect(rows[0].movie_id).toBe(MOVIE_2);
    expect(rows[0].base_price).toBe("40.00");
  });

  it("platform_admin's bypass is consistent across every protected column, including id", async () => {
    const attemptedNewId = "00000000-0000-0000-0000-00000000dffc";
    const rows = await asUser({ userId: ADMIN_USER, role: "authenticated" }, (tx) =>
      tx`update showtimes set id = ${attemptedNewId} where id = ${SHOWTIME_A} returning id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(attemptedNewId);
  });
});

// ---------------------------------------------------------------------------
// PERMISSION SEPARATION — explicit, direct proof that one catalog
// permission never implicitly grants another, using a single manager who
// holds exactly one permission and is denied both other operations.
// ---------------------------------------------------------------------------

describe("Catalog permissions do not imply one another", () => {
  it("manage_showtimes alone grants scheduling but neither pricing nor screens", async () => {
    const scheduleResult = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '8 days', 11.00, 'USD')
         returning id`,
    );
    expect(scheduleResult).toHaveLength(1);

    const priceResult = await asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
      tx`update showtimes set base_price = 1.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(priceResult).toHaveLength(0);

    await expect(
      asUser({ userId: MANAGER_SHOWTIMES_ONLY }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Should Fail')`,
      ),
    ).rejects.toThrow();
  });

  it("manage_pricing alone grants price updates but neither scheduling nor screens", async () => {
    const priceResult = await asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
      tx`update showtimes set base_price = 20.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(priceResult).toHaveLength(1);

    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '9 days', 11.00, 'USD')`,
      ),
    ).rejects.toThrow();

    await expect(
      asUser({ userId: MANAGER_PRICING_ONLY }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Should Fail 2')`,
      ),
    ).rejects.toThrow();
  });

  it("manage_screens alone grants screen creation but neither scheduling nor pricing", async () => {
    const screenResult = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Allowed Screen') returning id`,
    );
    expect(screenResult).toHaveLength(1);

    await expect(
      asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '10 days', 11.00, 'USD')`,
      ),
    ).rejects.toThrow();

    const priceResult = await asUser({ userId: MANAGER_SCREENS_ONLY }, (tx) =>
      tx`update showtimes set base_price = 5.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(priceResult).toHaveLength(0);
  });

  it("a manager holding all three permissions can perform all three operations", async () => {
    const screenResult = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'All Perms Screen') returning id`,
    );
    expect(screenResult).toHaveLength(1);

    const showtimeResult = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '11 days', 11.00, 'USD')
         returning id`,
    );
    expect(showtimeResult).toHaveLength(1);

    const priceResult = await asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
      tx`update showtimes set base_price = 25.00 where id = ${SHOWTIME_A} returning id`,
    );
    expect(priceResult).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// OWNER BEHAVIOR — full access regardless of the permissions jsonb (owners
// don't have permission keys at all in normal operation; 0008's bootstrap
// trigger creates them with an empty '{}' permissions object).
// ---------------------------------------------------------------------------

describe("Owners retain full catalog-management access for their own cinema", () => {
  it("the owner can create a screen without any permissions jsonb keys set", async () => {
    const [ownerRow] = await admin`
      select permissions from cinema_staff where cinema_id = ${CINEMA_A} and user_id = ${OWNER_A}
    `;
    expect(ownerRow.permissions).toEqual({}); // confirms this test proves owner status alone is sufficient

    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Owner Screen') returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("the owner can create, price, and delete a showtime for their own cinema", async () => {
    const created = await asUser({ userId: OWNER_A }, (tx) =>
      tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
         values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '12 days', 11.00, 'USD')
         returning id`,
    );
    expect(created).toHaveLength(1);
    const newShowtimeId = created[0].id as string;

    const priced = await asUser({ userId: OWNER_A }, (tx) =>
      tx`update showtimes set base_price = 30.00 where id = ${newShowtimeId} returning id`,
    );
    expect(priced).toHaveLength(1);

    const deleted = await asUser({ userId: OWNER_A }, (tx) =>
      tx`delete from showtimes where id = ${newShowtimeId} returning id`,
    );
    expect(deleted).toHaveLength(1);
  });

  it("the owner of Cinema A still cannot touch Cinema B (ownership does not cross tenants)", async () => {
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_B}, 'Owner A Overreach')`,
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MASTER MOVIE CATALOG — unaffected by 0013, re-verified here to prove no
// leakage: catalog (screens/showtimes) permissions must not grant movies access.
// ---------------------------------------------------------------------------

describe("Master movie catalog remains platform-admin-only", () => {
  it("platform admin can create a movie", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`insert into movies (title, duration_minutes, created_by)
         values ('New Admin Movie', 95, ${ADMIN_USER}) returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("platform admin can update a movie", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update movies set title = 'Updated Title' where id = ${MOVIE_1} returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("a cinema owner cannot create a movie", async () => {
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`insert into movies (title, duration_minutes, created_by)
           values ('Owner Movie', 90, ${OWNER_A})`,
      ),
    ).rejects.toThrow();
  });

  it("a manager holding EVERY catalog permission still cannot create a movie", async () => {
    // The key assertion for this hardening pass: manage_screens /
    // manage_showtimes / manage_pricing govern screens/showtimes only —
    // they must never leak into movies_write_admin_only.
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`insert into movies (title, duration_minutes, created_by)
           values ('Manager Movie', 90, ${MANAGER_ALL_PERMS})`,
      ),
    ).rejects.toThrow();
  });

  it("a manager holding every catalog permission still cannot edit a movie", async () => {
    await expect(
      asUser({ userId: MANAGER_ALL_PERMS }, (tx) =>
        tx`update movies set title = 'Hacked Title' where id = ${MOVIE_1}`,
      ),
    ).resolves.toBeDefined(); // the UPDATE runs (no error)...

    const [unchanged] = await admin`select title from movies where id = ${MOVIE_1}`;
    expect(unchanged.title).toBe("Phase 2 Test Movie"); // ...but affects 0 rows
  });
});
