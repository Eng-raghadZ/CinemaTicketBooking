-- 0008_cinema_owner_bootstrap.sql
-- When a cinema is created, its primary_owner_id must immediately have an
-- active 'owner' cinema_staff row — otherwise the owner cannot see or manage
-- the cinema they just created (RLS for cinemas or cinema_staff itself
-- doesn't consider primary_owner_id, only cinema_staff membership, by
-- design — see architecture note in lib/db/schema.ts: "owner and staff share
-- ONE authorization code path"). Without this trigger that design has a gap
-- at the moment of creation; this closes it.

create or replace function bootstrap_cinema_owner_staff_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into cinema_staff (cinema_id, user_id, role, status, invited_by)
  values (new.id, new.primary_owner_id, 'owner', 'active', new.primary_owner_id)
  on conflict (cinema_id, user_id) do nothing;
  return new;
end;
$$;

create trigger cinemas_bootstrap_owner_staff
  after insert on cinemas
  for each row execute function bootstrap_cinema_owner_staff_row();
