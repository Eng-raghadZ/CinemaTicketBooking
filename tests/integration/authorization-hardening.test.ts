import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminSql, asUser } from "./db-helper";

/**
 * Integration coverage for the authorization-hardening pass
 * (0015_suspended_cinema_state_enforcement.sql,
 * 0016_runtime_privilege_hardening.sql). Every test exercises real
 * Postgres through the caller's OWN simulated role (anon/authenticated via
 * `asUser`), never a service-role bypass, per the existing convention in
 * tests/integration/catalog-permissions-rls.test.ts and
 * tests/integration/public-browsing-rls.test.ts.
 *
 * Self-contained fixtures (own IDs). Four cinemas, one per status, each
 * with its own owner, so every test can pick the exact cinema-state row it
 * needs from the confirmed policy table:
 *
 *   status            owner/staff read   internal mutations   public visibility
 *   pending_review     allowed              allowed               hidden
 *   rejected            allowed              allowed               hidden
 *   approved            allowed              allowed               visible
 *   suspended           read-only            forbidden (non-admin)  hidden
 */

const admin = adminSql();

const ADMIN_USER = "00000000-0000-0000-0000-00000000f001";
const OWNER_PENDING = "00000000-0000-0000-0000-00000000f0a1";
const OWNER_REJECTED = "00000000-0000-0000-0000-00000000f0a2";
const OWNER_APPROVED = "00000000-0000-0000-0000-00000000f0a3";
const OWNER_SUSPENDED = "00000000-0000-0000-0000-00000000f0a4";
const OWNER_B = "00000000-0000-0000-0000-00000000f0b1";
const MANAGER_SUSPENDED = "00000000-0000-0000-0000-00000000f101";
const STAFF_SUSPENDED = "00000000-0000-0000-0000-00000000f102";

let CINEMA_PENDING: string;
let CINEMA_REJECTED: string;
let CINEMA_APPROVED: string;
let CINEMA_SUSPENDED: string;
let CINEMA_B: string;
let SCREEN_SUSPENDED: string;
let SCREEN_B: string;
let MOVIE_1: string;

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
      (${ADMIN_USER}, 'admin@hardening.test', 'Platform Admin'),
      (${OWNER_PENDING}, 'owner-pending@hardening.test', 'Owner Pending'),
      (${OWNER_REJECTED}, 'owner-rejected@hardening.test', 'Owner Rejected'),
      (${OWNER_APPROVED}, 'owner-approved@hardening.test', 'Owner Approved'),
      (${OWNER_SUSPENDED}, 'owner-suspended@hardening.test', 'Owner Suspended'),
      (${OWNER_B}, 'owner-b@hardening.test', 'Owner B'),
      (${MANAGER_SUSPENDED}, 'manager-suspended@hardening.test', 'Manager Suspended'),
      (${STAFF_SUSPENDED}, 'staff-suspended@hardening.test', 'Staff Suspended')
  `;

  await admin`
    insert into user_roles (user_id, role) values
      (${ADMIN_USER}, 'platform_admin'),
      (${OWNER_PENDING}, 'cinema_owner'),
      (${OWNER_REJECTED}, 'cinema_owner'),
      (${OWNER_APPROVED}, 'cinema_owner'),
      (${OWNER_SUSPENDED}, 'cinema_owner'),
      (${OWNER_B}, 'cinema_owner'),
      (${MANAGER_SUSPENDED}, 'cinema_staff'),
      (${STAFF_SUSPENDED}, 'cinema_staff')
  `;

  const [pending] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_PENDING}, 'Pending Cinema', 'US', 'USD', 'pending_review') returning id
  `;
  const [rejected] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status, rejection_reason)
    values (${OWNER_REJECTED}, 'Rejected Cinema', 'US', 'USD', 'rejected', 'Missing license') returning id
  `;
  const [approved] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_APPROVED}, 'Approved Cinema', 'US', 'USD', 'approved') returning id
  `;
  const [suspended] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_SUSPENDED}, 'Suspended Cinema', 'US', 'USD', 'suspended') returning id
  `;
  const [cinemaB] = await admin`
    insert into cinemas (primary_owner_id, name, country_code, currency_code, status)
    values (${OWNER_B}, 'Cinema B', 'US', 'USD', 'approved') returning id
  `;
  CINEMA_PENDING = pending.id;
  CINEMA_REJECTED = rejected.id;
  CINEMA_APPROVED = approved.id;
  CINEMA_SUSPENDED = suspended.id;
  CINEMA_B = cinemaB.id;
  // 0008's bootstrap trigger already gave each owner an active 'owner'
  // cinema_staff row for their own cinema.

  await admin`
    insert into cinema_staff (cinema_id, user_id, role, status, permissions) values
      (${CINEMA_SUSPENDED}, ${MANAGER_SUSPENDED}, 'manager', 'active',
        '{"manage_screens": true, "manage_showtimes": true, "manage_pricing": true}'::jsonb),
      (${CINEMA_SUSPENDED}, ${STAFF_SUSPENDED}, 'staff', 'active', '{}'::jsonb)
  `;

  const [screenSuspended] = await admin`
    insert into screens (cinema_id, name) values (${CINEMA_SUSPENDED}, 'Screen S1') returning id
  `;
  SCREEN_SUSPENDED = screenSuspended.id;

  const [screenB] = await admin`
    insert into screens (cinema_id, name) values (${CINEMA_B}, 'Screen B1') returning id
  `;
  SCREEN_B = screenB.id;

  const [movie1] = await admin`
    insert into movies (title, duration_minutes, created_by)
    values ('Hardening Test Movie', 100, ${ADMIN_USER}) returning id
  `;
  MOVIE_1 = movie1.id;

  await admin`
    insert into cinema_movies (cinema_id, movie_id, added_by)
    values (${CINEMA_SUSPENDED}, ${MOVIE_1}, ${OWNER_SUSPENDED})
  `;
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
// RUNTIME GRANTS
// ---------------------------------------------------------------------------

describe("Runtime grant hardening (0016)", () => {
  it("anon cannot TRUNCATE an application table", async () => {
    await expect(asUser({ role: "anon" }, (tx) => tx`truncate table cinemas`)).rejects.toThrow();
  });

  it("authenticated cannot TRUNCATE an application table", async () => {
    await expect(
      asUser({ userId: OWNER_APPROVED }, (tx) => tx`truncate table cinemas`),
    ).rejects.toThrow();
  });

  it("private tables remain inaccessible to anon (table-level permission denied, not a filtered empty result)", async () => {
    await expect(asUser({ role: "anon" }, (tx) => tx`select id from cinema_staff`)).rejects.toThrow(
      /permission denied for table cinema_staff/i,
    );
    await expect(asUser({ role: "anon" }, (tx) => tx`select id from audit_logs`)).rejects.toThrow(
      /permission denied for table audit_logs/i,
    );
    await expect(asUser({ role: "anon" }, (tx) => tx`select id from users`)).rejects.toThrow(
      /permission denied for table users/i,
    );
  });

  it("required public reads still function after the grant cleanup", async () => {
    const rows = await asUser({ role: "anon" }, (tx) =>
      tx`select id from cinemas where id = ${CINEMA_APPROVED}`,
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CROSS-CINEMA ISOLATION
// ---------------------------------------------------------------------------

describe("Cross-cinema isolation", () => {
  it("a suspended cinema's manager cannot read Cinema B's staff roster", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`select id from cinema_staff where cinema_id = ${CINEMA_B}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a suspended cinema's manager cannot mutate Cinema B's screens", async () => {
    await expect(
      asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_B}, 'Hack Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("Cinema B's public data remains readable via public browsing regardless of Cinema A's state", async () => {
    const rows = await asUser({ role: "anon" }, (tx) => tx`select id from screens where id = ${SCREEN_B}`);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// MEMBERSHIP SAFETY
// ---------------------------------------------------------------------------

describe("Membership safety", () => {
  it("staff cannot promote their own role", async () => {
    await expect(
      asUser({ userId: STAFF_SUSPENDED }, (tx) =>
        tx`update cinema_staff set role = 'owner' where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED}`,
      ),
    ).rejects.toThrow(/owner membership cannot be created through update/i);
    const [unchanged] = await admin`select role from cinema_staff where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED}`;
    expect(unchanged.role).toBe("staff");
  });

  it("staff cannot change their own permissions", async () => {
    await expect(
      asUser({ userId: STAFF_SUSPENDED }, (tx) =>
        tx`update cinema_staff set permissions = '{"manage_staff": true}'::jsonb
           where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED}`,
      ),
    ).rejects.toThrow(/not authorized to update this cinema staff membership/i);
  });

  it("a member cannot move their own membership to another cinema", async () => {
    await expect(
      asUser({ userId: STAFF_SUSPENDED }, (tx) =>
        tx`update cinema_staff set cinema_id = ${CINEMA_B}
           where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED}`,
      ),
    ).rejects.toThrow(/not authorized to update this cinema staff membership/i);
  });

  it("a manager cannot reassign a membership to a different user_id", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update cinema_staff set user_id = ${OWNER_B}
         where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("invitation acceptance changes only the status field (on a mutable cinema)", async () => {
    const [invitee] = await admin`
      insert into users (id, email, full_name) values (gen_random_uuid(), 'invitee@hardening.test', 'Invitee') returning id
    `;
    await admin`insert into user_roles (user_id, role) values (${invitee.id}, 'cinema_staff')`;
    const [invite] = await admin`
      insert into cinema_staff (cinema_id, user_id, role, status, invited_by)
      values (${CINEMA_APPROVED}, ${invitee.id}, 'staff', 'invited', ${OWNER_APPROVED}) returning id
    `;
    const rows = await asUser({ userId: invitee.id }, (tx) =>
      tx`update cinema_staff set status = 'active' where id = ${invite.id} returning status, role, cinema_id, user_id`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active", role: "staff", cinema_id: CINEMA_APPROVED, user_id: invitee.id });
  });

  it("a suspended cinema's invitation cannot be accepted", async () => {
    const [invitee] = await admin`
      insert into users (id, email, full_name) values (gen_random_uuid(), 'invitee-susp@hardening.test', 'Invitee Susp') returning id
    `;
    await admin`insert into user_roles (user_id, role) values (${invitee.id}, 'cinema_staff')`;
    const [invite] = await admin`
      insert into cinema_staff (cinema_id, user_id, role, status, invited_by)
      values (${CINEMA_SUSPENDED}, ${invitee.id}, 'staff', 'invited', ${OWNER_SUSPENDED}) returning id
    `;
    await expect(
      asUser({ userId: invitee.id }, (tx) =>
        tx`update cinema_staff set status = 'active' where id = ${invite.id}`,
      ),
    ).rejects.toThrow(/not authorized to update this cinema staff membership/i);
    const [stillInvited] = await admin`select status from cinema_staff where id = ${invite.id}`;
    expect(stillInvited.status).toBe("invited");
  });

  it("a suspended cinema's staff cannot be invited by its manager", async () => {
    const [invitee] = await admin`
      insert into users (id, email, full_name) values (gen_random_uuid(), 'new-invitee@hardening.test', 'New Invitee') returning id
    `;
    await expect(
      asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
        tx`insert into cinema_staff (cinema_id, user_id, role, status, invited_by)
           values (${CINEMA_SUSPENDED}, ${invitee.id}, 'staff', 'invited', ${MANAGER_SUSPENDED})`,
      ),
    ).rejects.toThrow();
  });

  it("a suspended cinema's active staff cannot be revoked by its manager", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update cinema_staff set status = 'revoked'
         where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a suspended cinema's revoked staff cannot be reinvited by its manager", async () => {
    await admin`update cinema_staff set status = 'revoked' where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED}`;
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update cinema_staff set status = 'invited', invited_by = ${MANAGER_SUSPENDED}
         where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED} and status = 'revoked' returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("platform_admin CAN revoke a suspended cinema's staff (admin retains full administration)", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinema_staff set status = 'revoked'
         where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${STAFF_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("owner membership protections remain intact: even platform_admin cannot demote an owner via UPDATE", async () => {
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinema_staff set role = 'manager'
           where cinema_id = ${CINEMA_SUSPENDED} and user_id = ${OWNER_SUSPENDED}`,
      ),
    ).rejects.toThrow(/owner membership cannot be modified/i);
  });
});

// ---------------------------------------------------------------------------
// CINEMA-COLUMN SAFETY
// ---------------------------------------------------------------------------

describe("Cinema-column safety", () => {
  it("ordinary staff cannot modify cinema profile fields", async () => {
    const rows = await asUser({ userId: STAFF_SUSPENDED }, (tx) =>
      tx`update cinemas set name = 'Hacked Name' where id = ${CINEMA_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("a non-owner manager cannot modify cinema profile fields either", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update cinemas set name = 'Manager Hack' where id = ${CINEMA_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("non-admin users cannot modify primary_owner_id", async () => {
    await expect(
      asUser({ userId: OWNER_APPROVED }, (tx) =>
        tx`update cinemas set primary_owner_id = ${OWNER_B} where id = ${CINEMA_APPROVED}`,
      ),
    ).rejects.toThrow(/administrative\/ownership/i);
  });

  it("non-admin users cannot modify rejection_reason", async () => {
    await expect(
      asUser({ userId: OWNER_REJECTED }, (tx) =>
        tx`update cinemas set rejection_reason = 'self-cleared' where id = ${CINEMA_REJECTED}`,
      ),
    ).rejects.toThrow(/administrative\/ownership/i);
  });

  it("the owner CAN modify an allowed profile field (name) on a pending_review cinema", async () => {
    const rows = await asUser({ userId: OWNER_PENDING }, (tx) =>
      tx`update cinemas set name = 'Renamed Pending Cinema' where id = ${CINEMA_PENDING} returning name`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Renamed Pending Cinema");
  });

  it("the owner CAN modify an allowed profile field on a rejected cinema", async () => {
    const rows = await asUser({ userId: OWNER_REJECTED }, (tx) =>
      tx`update cinemas set description = 'Reapplying soon' where id = ${CINEMA_REJECTED} returning description`,
    );
    expect(rows).toHaveLength(1);
  });

  it("the owner CANNOT modify the profile of a SUSPENDED cinema", async () => {
    await expect(
      asUser({ userId: OWNER_SUSPENDED }, (tx) =>
        tx`update cinemas set name = 'Trying to rename' where id = ${CINEMA_SUSPENDED}`,
      ),
    ).rejects.toThrow(/suspended cinema is read-only for non-admin users/i);
    const [unchanged] = await admin`select name from cinemas where id = ${CINEMA_SUSPENDED}`;
    expect(unchanged.name).toBe("Suspended Cinema");
  });

  it("platform_admin review actions still work: approve a pending cinema", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_PENDING} returning status`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("approved");
  });

  it("platform_admin CAN reinstate a suspended cinema", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_SUSPENDED} returning status`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// CATALOG BEHAVIOR BY CINEMA STATE
// ---------------------------------------------------------------------------

describe("Catalog behavior by cinema state: screens", () => {
  it("pending_review: owner can create a screen; it is not publicly visible", async () => {
    const created = await asUser({ userId: OWNER_PENDING }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_PENDING}, 'Pending Screen') returning id`,
    );
    expect(created).toHaveLength(1);
    const publicRows = await asUser({ role: "anon" }, (tx) => tx`select id from screens where id = ${created[0].id}`);
    expect(publicRows).toHaveLength(0);
  });

  it("rejected: owner can create a screen; it is not publicly visible", async () => {
    const created = await asUser({ userId: OWNER_REJECTED }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_REJECTED}, 'Rejected Screen') returning id`,
    );
    expect(created).toHaveLength(1);
    const publicRows = await asUser({ role: "anon" }, (tx) => tx`select id from screens where id = ${created[0].id}`);
    expect(publicRows).toHaveLength(0);
  });

  it("approved: owner can create a screen; it IS publicly visible", async () => {
    const created = await asUser({ userId: OWNER_APPROVED }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_APPROVED}, 'Approved Screen') returning id`,
    );
    expect(created).toHaveLength(1);
    const publicRows = await asUser({ role: "anon" }, (tx) => tx`select id from screens where id = ${created[0].id}`);
    expect(publicRows).toHaveLength(1);
  });

  it("suspended: owner cannot create a screen", async () => {
    await expect(
      asUser({ userId: OWNER_SUSPENDED }, (tx) =>
        tx`insert into screens (cinema_id, name) values (${CINEMA_SUSPENDED}, 'Denied Screen')`,
      ),
    ).rejects.toThrow();
  });

  it("suspended: manager with manage_screens cannot update an existing screen", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update screens set name = 'Renamed' where id = ${SCREEN_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("suspended: manager with manage_screens cannot delete an existing screen", async () => {
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`delete from screens where id = ${SCREEN_SUSPENDED} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("suspended: the owner/staff can still READ the cinema's screens (preserved internal data)", async () => {
    const ownerRows = await asUser({ userId: OWNER_SUSPENDED }, (tx) =>
      tx`select id from screens where id = ${SCREEN_SUSPENDED}`,
    );
    expect(ownerRows).toHaveLength(1);
    const staffRows = await asUser({ userId: STAFF_SUSPENDED }, (tx) =>
      tx`select id from screens where id = ${SCREEN_SUSPENDED}`,
    );
    expect(staffRows).toHaveLength(1);
  });

  it("suspended: platform_admin can still create/update/delete screens", async () => {
    const created = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_SUSPENDED}, 'Admin Screen') returning id`,
    );
    expect(created).toHaveLength(1);
  });
});

describe("Catalog behavior by cinema state: cinema_movies", () => {
  it("suspended: owner cannot add a cinema_movies association", async () => {
    const [otherMovie] = await admin`
      insert into movies (title, duration_minutes, created_by) values ('Another Movie', 90, ${ADMIN_USER}) returning id
    `;
    await expect(
      asUser({ userId: OWNER_SUSPENDED }, (tx) =>
        tx`insert into cinema_movies (cinema_id, movie_id, added_by) values (${CINEMA_SUSPENDED}, ${otherMovie.id}, ${OWNER_SUSPENDED})`,
      ),
    ).rejects.toThrow();
  });

  it("suspended: owner cannot remove an existing cinema_movies association", async () => {
    const rows = await asUser({ userId: OWNER_SUSPENDED }, (tx) =>
      tx`delete from cinema_movies where cinema_id = ${CINEMA_SUSPENDED} and movie_id = ${MOVIE_1} returning movie_id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("suspended: the association remains readable", async () => {
    const rows = await asUser({ userId: OWNER_SUSPENDED }, (tx) =>
      tx`select movie_id from cinema_movies where cinema_id = ${CINEMA_SUSPENDED}`,
    );
    expect(rows).toHaveLength(1);
  });

  it("approved: owner CAN add a cinema_movies association", async () => {
    const rows = await asUser({ userId: OWNER_APPROVED }, (tx) =>
      tx`insert into cinema_movies (cinema_id, movie_id, added_by) values (${CINEMA_APPROVED}, ${MOVIE_1}, ${OWNER_APPROVED}) returning movie_id`,
    );
    expect(rows).toHaveLength(1);
  });

  it("global movie creation remains platform-admin-only regardless of cinema state", async () => {
    await expect(
      asUser({ userId: OWNER_SUSPENDED }, (tx) =>
        tx`insert into movies (title, duration_minutes, created_by) values ('Owner Movie', 90, ${OWNER_SUSPENDED})`,
      ),
    ).rejects.toThrow();
  });
});

describe("Catalog behavior by cinema state: showtimes", () => {
  it("suspended: manager cannot create a showtime", async () => {
    await expect(
      asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
        tx`insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
           values (${CINEMA_SUSPENDED}, ${SCREEN_SUSPENDED}, ${MOVIE_1}, now() + interval '2 days', 10.00, 'USD')`,
      ),
    ).rejects.toThrow();
  });

  it("suspended: manager cannot reprice an existing showtime", async () => {
    const [showtime] = await admin`
      insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
      values (${CINEMA_SUSPENDED}, ${SCREEN_SUSPENDED}, ${MOVIE_1}, now() + interval '2 days', 10.00, 'USD')
      returning id
    `;
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`update showtimes set base_price = 5.00 where id = ${showtime.id} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("suspended: manager cannot delete an existing showtime", async () => {
    const [showtime] = await admin`
      insert into showtimes (cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)
      values (${CINEMA_SUSPENDED}, ${SCREEN_SUSPENDED}, ${MOVIE_1}, now() + interval '2 days', 10.00, 'USD')
      returning id
    `;
    const rows = await asUser({ userId: MANAGER_SUSPENDED }, (tx) =>
      tx`delete from showtimes where id = ${showtime.id} returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("reinstating a suspended cinema restores write capability without data loss or duplication", async () => {
    const [before] = await admin`select count(*)::int as n from screens where cinema_id = ${CINEMA_SUSPENDED}`;

    await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_SUSPENDED}`,
    );

    const [after] = await admin`select count(*)::int as n from screens where cinema_id = ${CINEMA_SUSPENDED}`;
    expect(after.n).toBe(before.n);

    const rows = await asUser({ userId: OWNER_SUSPENDED }, (tx) =>
      tx`insert into screens (cinema_id, name) values (${CINEMA_SUSPENDED}, 'Post-Reinstate Screen') returning id`,
    );
    expect(rows).toHaveLength(1);

    const publicRows = await asUser({ role: "anon" }, (tx) => tx`select id from cinemas where id = ${CINEMA_SUSPENDED}`);
    expect(publicRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// STATE-TRANSITION ENFORCEMENT
// ---------------------------------------------------------------------------

describe("Cinema status transitions: legal edges", () => {
  it("pending_review -> approved succeeds for admin", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_PENDING} returning status`,
    );
    expect(rows[0].status).toBe("approved");
  });

  it("pending_review -> rejected succeeds for admin", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'rejected', reviewed_by = ${ADMIN_USER}, reviewed_at = now(), rejection_reason = 'test'
         where id = ${CINEMA_PENDING} returning status`,
    );
    expect(rows[0].status).toBe("rejected");
  });

  it("approved -> suspended succeeds for admin", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'suspended', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_APPROVED} returning status`,
    );
    expect(rows[0].status).toBe("suspended");
  });

  it("suspended -> approved succeeds for admin", async () => {
    const rows = await asUser({ userId: ADMIN_USER }, (tx) =>
      tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
         where id = ${CINEMA_SUSPENDED} returning status`,
    );
    expect(rows[0].status).toBe("approved");
  });
});

describe("Cinema status transitions: illegal edges are rejected even for platform_admin", () => {
  it("rejects rejected -> approved (skipping resubmission)", async () => {
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinemas set status = 'approved', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
           where id = ${CINEMA_REJECTED}`,
      ),
    ).rejects.toThrow(/illegal cinema status transition/i);
  });

  it("rejects pending_review -> suspended (invalid source state for suspend)", async () => {
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinemas set status = 'suspended', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
           where id = ${CINEMA_PENDING}`,
      ),
    ).rejects.toThrow(/illegal cinema status transition/i);
  });

  it("rejects suspended -> rejected", async () => {
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinemas set status = 'rejected', reviewed_by = ${ADMIN_USER}, reviewed_at = now()
           where id = ${CINEMA_SUSPENDED}`,
      ),
    ).rejects.toThrow(/illegal cinema status transition/i);
  });

  it("rejects approved -> pending_review (reinstate-while-already-approved has no legal edge back to draft)", async () => {
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinemas set status = 'pending_review' where id = ${CINEMA_APPROVED}`,
      ),
    ).rejects.toThrow(/illegal cinema status transition/i);
  });

  it("a non-admin attempting to change their own cinema's status is rejected (isolated from the suspended-lockout check by using a mutable, approved cinema)", async () => {
    // Deliberately uses CINEMA_APPROVED, not CINEMA_SUSPENDED: both the new
    // profile-scope trigger (cinema_is_mutable check) and this
    // status-change trigger fire on the same UPDATE, and Postgres runs
    // BEFORE triggers in name order — "cinemas_enforce_profile_update_scope"
    // before "cinemas_enforce_status_change". On a suspended cinema, the
    // profile trigger's suspended-check would fire first and mask which
    // check is actually being exercised here. Using an approved (mutable)
    // cinema isolates this test to exactly the "only platform_admin may
    // change status" rule, independent of the suspended-cinema rule
    // (already directly covered by the previous test).
    await expect(
      asUser({ userId: OWNER_APPROVED }, (tx) =>
        tx`update cinemas set status = 'suspended' where id = ${CINEMA_APPROVED}`,
      ),
    ).rejects.toThrow(/only a platform_admin may change cinema status/i);
  });

  it("a rejected illegal transition attempt leaves no audit_logs row (no misleading success trail)", async () => {
    const [before] = await admin`select count(*)::int as n from audit_logs`;
    await expect(
      asUser({ userId: ADMIN_USER }, (tx) =>
        tx`update cinemas set status = 'approved' where id = ${CINEMA_REJECTED}`,
      ),
    ).rejects.toThrow();
    const [after] = await admin`select count(*)::int as n from audit_logs`;
    expect(after.n).toBe(before.n);
  });
});
