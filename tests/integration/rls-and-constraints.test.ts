import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, asUser } from "./db-helper";

const admin = adminSql();

// Fixture IDs (fixed so tests are easy to reason about).
const ADMIN_USER = "00000000-0000-0000-0000-00000000a001";
const OWNER_A = "00000000-0000-0000-0000-0000000000a1";
const OWNER_B = "00000000-0000-0000-0000-0000000000b1";
const STAFF_A = "00000000-0000-0000-0000-00000000a002"; // 'staff' role at Cinema A
const CUSTOMER_1 = "00000000-0000-0000-0000-0000000000c1";
const CUSTOMER_2 = "00000000-0000-0000-0000-0000000000c2";

let CINEMA_A: string;
let CINEMA_B: string;
let SCREEN_A: string;
let SEAT_A1: string;
let SEAT_A2: string;
let MOVIE_1: string;
let SHOWTIME_A: string;

async function resetFixtures() {
  // Truncate everything except schema_migrations, in FK-safe order.
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
      (${ADMIN_USER}, 'admin@platform.test', 'Platform Admin'),
      (${OWNER_A}, 'ownerA@platform.test', 'Owner A'),
      (${OWNER_B}, 'ownerB@platform.test', 'Owner B'),
      (${STAFF_A}, 'staffA@platform.test', 'Staff A'),
      (${CUSTOMER_1}, 'customer1@platform.test', 'Customer One'),
      (${CUSTOMER_2}, 'customer2@platform.test', 'Customer Two')
  `;

  await admin`
    insert into user_roles (user_id, role) values
      (${ADMIN_USER}, 'platform_admin'),
      (${OWNER_A}, 'cinema_owner'),
      (${OWNER_B}, 'cinema_owner'),
      (${STAFF_A}, 'cinema_staff'),
      (${CUSTOMER_1}, 'customer'),
      (${CUSTOMER_2}, 'customer')
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

  // Note: the 0008 bootstrap trigger already created 'owner' cinema_staff
  // rows for OWNER_A/CINEMA_A and OWNER_B/CINEMA_B automatically — only the
  // additional staff member needs to be inserted explicitly here.
  await admin`
    insert into cinema_staff (cinema_id, user_id, role, status) values
      (${CINEMA_A}, ${STAFF_A}, 'staff', 'active')
  `;

  const [screenA] = await admin`
    insert into screens (cinema_id, name) values (${CINEMA_A}, 'Screen 1') returning id
  `;
  SCREEN_A = screenA.id;

  const [seatA1] = await admin`
    insert into seats (screen_id, row, number) values (${SCREEN_A}, 'A', 1) returning id
  `;
  const [seatA2] = await admin`
    insert into seats (screen_id, row, number) values (${SCREEN_A}, 'A', 2) returning id
  `;
  SEAT_A1 = seatA1.id;
  SEAT_A2 = seatA2.id;

  const [movie1] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Test Movie', 120, ${ADMIN_USER}) returning id
  `;
  MOVIE_1 = movie1.id;

  const [showtimeA] = await admin`
    insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
    values (${CINEMA_A}, ${SCREEN_A}, ${MOVIE_1}, now() + interval '2 days', 12.50, 'USD')
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

describe("Cross-cinema tenant isolation (RLS)", () => {
  it("Owner A CAN see Cinema B's public (approved) listing, same as any visitor", async () => {
    // Approved cinemas are intentionally public — Owner A is also a
    // prospective customer of other cinemas. Isolation applies to PRIVATE
    // data (staff, bookings, non-approved cinemas), covered below.
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_B}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Owner A cannot see Cinema B while it is NOT yet approved (private pre-launch data)", async () => {
    const [privateB] = await admin`
      insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
      values (${OWNER_B}, 'Cinema B Draft', 'US', 'USD', 'pending_review') returning id
    `;
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`select id from cinemas where id = ${privateB.id}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("Owner A CAN see their own Cinema A", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_A}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Owner A cannot see Cinema B's staff list", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`select * from cinema_staff where cinema_id = ${CINEMA_B}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("Owner A cannot invite staff to Cinema B (INSERT blocked)", async () => {
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`insert into cinema_staff (cinema_id, user_id, role, invited_by, status)
           values (${CINEMA_B}, ${CUSTOMER_1}, 'staff', ${OWNER_A}, 'invited')`,
      ),
    ).rejects.toThrow();
  });

  it("A 'staff' role member cannot write to another cinema's screens", async () => {
    await expect(
      asUser({ userId: STAFF_A }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_B}, 'Hack Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("A 'staff' role member (not owner/manager) cannot create a screen even on their OWN cinema", async () => {
    // staff role has no write permission on screens per the approved
    // authorization model — only owner/manager can.
    await expect(
      asUser({ userId: STAFF_A }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'New Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("Owner A can create a screen on their own cinema", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_A}, 'Screen 2') returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Customer cannot see another customer's bookings", async () => {
    await admin`
      insert into bookings (id, user_id, cinema_id, showtime_id, idempotency_key, total_amount, currency_code)
      values (gen_random_uuid(), ${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'idem-1', 12.50, 'USD')
    `;
    const rows = await asUser({ userId: CUSTOMER_2 }, (tx) => tx`select * from bookings`);
    expect(rows).toHaveLength(0);
  });

  it("Platform admin CAN see both cinemas", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`select id from cinemas order by name`,
    );
    expect(rows.map((r) => (r as { id: string }).id).sort()).toEqual([CINEMA_A, CINEMA_B].sort());
  });

  it("Unauthenticated (anon) visitor can browse an approved cinema but not a pending one", async () => {
    const [pending] = await admin`
      insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
      values (${OWNER_B}, 'Pending Cinema', 'US', 'USD', 'pending_review') returning id
    `;
    const visible = await asUser({ role: "anon" }, (tx) =>
      tx`select id from cinemas where id in (${CINEMA_A}, ${pending.id})`,
    );
    expect(visible.map((r) => (r as { id: string }).id)).toEqual([CINEMA_A]);
  });
});

describe("Cinema onboarding approval (self-approval blocked)", () => {
  it("Owner cannot approve their own pending cinema", async () => {
    const [pending] = await admin`
      insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
      values (${OWNER_A}, 'New Cinema', 'US', 'USD', 'pending_review') returning id
    `;
    // The 0008 bootstrap trigger already gave OWNER_A an active 'owner'
    // cinema_staff row for this new cinema — that's exactly the scenario
    // being tested (owner can see/manage it, but still can't self-approve).

    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`update cinemas set status = 'approved' where id = ${pending.id}`,
      ),
    ).rejects.toThrow();

    const [row] = await admin`select status from cinemas where id = ${pending.id}`;
    expect(row.status).toBe("pending_review");
  });

  it("Platform admin CAN approve a pending cinema", async () => {
    const [pending] = await admin`
      insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
      values (${OWNER_A}, 'New Cinema 2', 'US', 'USD', 'pending_review') returning id
    `;
    await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${pending.id}`,
    );
    const [row] = await admin`select status from cinemas where id = ${pending.id}`;
    expect(row.status).toBe("approved");
  });

  it("A newly self-registered cinema is forced to pending_review even if the client claims 'approved'", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
         values (${OWNER_A}, 'Sneaky Cinema', 'US', 'USD', 'approved')
         returning status`,
    );
    expect(rows[0].status).toBe("pending_review");
  });
});

describe("Movie catalog governance (platform_admin only)", () => {
  it("Cinema owner cannot create a movie", async () => {
    await expect(
      asUser({ userId: OWNER_A }, (tx) =>
        tx`insert into movies (title, duration_minutes, created_by)
           values ('Owner Movie', 90, ${OWNER_A})`,
      ),
    ).rejects.toThrow();
  });

  it("Platform admin can create a movie", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`insert into movies (title, duration_minutes, created_by)
         values ('Admin Movie', 100, ${ADMIN_USER}) returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Cinema owner CAN add an existing catalog movie to their cinema (cinema_movies)", async () => {
    const rows = await asUser({ userId: OWNER_A }, (tx) =>
      tx`insert into cinema_movies (cinema_id, movie_id, added_by)
         values (${CINEMA_A}, ${MOVIE_1}, ${OWNER_A}) returning *`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Everyone can read the public movie catalog", async () => {
    const rows = await asUser({ role: "anon" }, (tx) => tx`select id from movies`);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("Double-booking prevention (DB constraint)", () => {
  it("A second concurrent hold on the same seat/showtime is rejected", async () => {
    await admin`
      insert into seat_holds (showtime_id, seat_id, user_id, expires_at, status)
      values (${SHOWTIME_A}, ${SEAT_A1}, ${CUSTOMER_1}, now() + interval '10 minutes', 'held')
    `;
    await expect(
      admin`
        insert into seat_holds (showtime_id, seat_id, user_id, expires_at, status)
        values (${SHOWTIME_A}, ${SEAT_A1}, ${CUSTOMER_2}, now() + interval '10 minutes', 'held')
      `,
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  it("A RELEASED hold does not block a new hold on the same seat", async () => {
    await admin`
      insert into seat_holds (showtime_id, seat_id, user_id, expires_at, status)
      values (${SHOWTIME_A}, ${SEAT_A1}, ${CUSTOMER_1}, now() - interval '1 minute', 'released')
    `;
    const rows = await admin`
      insert into seat_holds (showtime_id, seat_id, user_id, expires_at, status)
      values (${SHOWTIME_A}, ${SEAT_A1}, ${CUSTOMER_2}, now() + interval '10 minutes', 'held')
      returning id
    `;
    expect(rows).toHaveLength(1);
  });

  it("Simulated concurrent double-book attempt: exactly one of two parallel inserts succeeds", async () => {
    const attempt = () =>
      admin`
        insert into seat_holds (showtime_id, seat_id, user_id, expires_at, status)
        values (${SHOWTIME_A}, ${SEAT_A2}, ${CUSTOMER_1}, now() + interval '10 minutes', 'held')
      `;
    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe("Idempotent, single-use ticket check-in", () => {
  it("First check-in scan succeeds, second concurrent scan of the same ticket does not", async () => {
    const [booking] = await admin`
      insert into bookings (user_id, cinema_id, showtime_id, status, idempotency_key, total_amount, currency_code)
      values (${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'confirmed', 'idem-checkin-1', 12.50, 'USD')
      returning id, ticket_reference
    `;
    const [staffRow] = await admin`select id from cinema_staff where user_id = ${STAFF_A}`;

    const checkIn = () =>
      admin`
        update bookings set status = 'checked_in', checked_in_at = now(), checked_in_by = ${staffRow.id}
        where ticket_reference = ${booking.ticket_reference} and status = 'confirmed'
        returning id
      `;

    const [first, second] = await Promise.all([checkIn(), checkIn()]);
    const successCount = [first, second].filter((r) => r.length === 1).length;
    expect(successCount).toBe(1);

    const [final] = await admin`select status from bookings where id = ${booking.id}`;
    expect(final.status).toBe("checked_in");
  });

  it("Cinema staff can perform a check-in through RLS as themselves", async () => {
    const [booking] = await admin`
      insert into bookings (user_id, cinema_id, showtime_id, status, idempotency_key, total_amount, currency_code)
      values (${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'confirmed', 'idem-checkin-2', 12.50, 'USD')
      returning id, ticket_reference
    `;
    const [staffRow] = await admin`select id from cinema_staff where user_id = ${STAFF_A}`;

    const rows = await asUser({ userId: STAFF_A }, (tx) =>
      tx`update bookings set status = 'checked_in', checked_in_at = now(), checked_in_by = ${staffRow.id}
         where ticket_reference = ${booking.ticket_reference} and status = 'confirmed'
         returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("Cinema staff cannot alter a booking's financial fields while checking it in", async () => {
    const [booking] = await admin`
      insert into bookings (user_id, cinema_id, showtime_id, status, idempotency_key, total_amount, currency_code)
      values (${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'confirmed', 'idem-checkin-3', 12.50, 'USD')
      returning id, ticket_reference
    `;
    await expect(
      asUser({ userId: STAFF_A }, (tx) =>
        tx`update bookings set status = 'checked_in', total_amount = 0.01
           where id = ${booking.id}`,
      ),
    ).rejects.toThrow();
  });

  it("Staff from a DIFFERENT cinema cannot check in this booking", async () => {
    const [ownerBBooking] = await admin`
      insert into bookings (user_id, cinema_id, showtime_id, status, idempotency_key, total_amount, currency_code)
      values (${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'confirmed', 'idem-checkin-4', 12.50, 'USD')
      returning id, ticket_reference
    `;
    const rows = await asUser({ userId: OWNER_B }, (tx) =>
      tx`update bookings set status = 'checked_in', checked_in_at = now()
         where ticket_reference = ${ownerBBooking.ticket_reference} and status = 'confirmed'
         returning id`,
    );
    expect(rows).toHaveLength(0); // RLS hides the row entirely — 0 rows affected, not an error
  });
});

describe("Max seats per booking (DB-level backstop)", () => {
  it("rejects adding a seat beyond the booking's max_seats_per_booking", async () => {
    const [booking] = await admin`
      insert into bookings (user_id, cinema_id, showtime_id, idempotency_key, total_amount, currency_code, max_seats_per_booking)
      values (${CUSTOMER_1}, ${CINEMA_A}, ${SHOWTIME_A}, 'idem-maxseats', 12.50, 'USD', 1)
      returning id
    `;
    await admin`insert into booking_seats (booking_id, seat_id) values (${booking.id}, ${SEAT_A1})`;
    await expect(
      admin`insert into booking_seats (booking_id, seat_id) values (${booking.id}, ${SEAT_A2})`,
    ).rejects.toThrow(/already has the maximum/);
  });
});

describe("Cancellation policy bounded by platform limits (trigger)", () => {
  it("rejects a cinema policy more lenient than the platform maximum refund", async () => {
    await admin`
      insert into platform_policy_limits (min_cancellation_window_hours, max_refund_percentage)
      values (2, 80)
    `;
    await expect(
      admin`
        insert into cinema_cancellation_policies (cinema_id, cancellation_window_hours, refund_percentage)
        values (${CINEMA_A}, 2, 100)
      `,
    ).rejects.toThrow(/exceeds the platform maximum/);
  });

  it("rejects a cancellation window shorter than the platform minimum", async () => {
    await admin`
      insert into platform_policy_limits (min_cancellation_window_hours, max_refund_percentage)
      values (4, 100)
    `;
    await expect(
      admin`
        insert into cinema_cancellation_policies (cinema_id, cancellation_window_hours, refund_percentage)
        values (${CINEMA_A}, 1, 50)
      `,
    ).rejects.toThrow(/below the platform minimum/);
  });

  it("accepts a cinema policy within platform bounds", async () => {
    await admin`
      insert into platform_policy_limits (min_cancellation_window_hours, max_refund_percentage)
      values (2, 100)
    `;
    const rows = await admin`
      insert into cinema_cancellation_policies (cinema_id, cancellation_window_hours, refund_percentage)
      values (${CINEMA_A}, 24, 90) returning cinema_id
    `;
    expect(rows).toHaveLength(1);
  });
});

describe("No self-escalation via user_roles", () => {
  it("a customer cannot grant themselves platform_admin", async () => {
    await expect(
      asUser({ userId: CUSTOMER_1 }, (tx) =>
        tx`update user_roles set role = 'platform_admin' where user_id = ${CUSTOMER_1}`,
      ),
    ).resolves.toBeDefined(); // the UPDATE runs (no error)...

    const [row] = await admin`select role from user_roles where user_id = ${CUSTOMER_1}`;
    expect(row.role).toBe("customer"); // ...but affects 0 rows, since no UPDATE policy grants it
  });
});
