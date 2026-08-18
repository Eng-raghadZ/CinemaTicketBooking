-- Protect cinema_staff ownership and prevent self-escalation.
--
-- Rules:
-- 1. Owner memberships are created only by the cinema bootstrap trigger.
-- 2. An invited user may only accept their own invite.
-- 3. Staff managers may only revoke non-owner memberships.
-- 4. Role, permissions, ownership, and cinema/user identity cannot be changed
--    through a normal membership update.

create or replace function enforce_cinema_staff_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The owner membership is immutable. Ownership transfer is not implemented
  -- and must use a dedicated audited workflow in the future.
  if old.role = 'owner' then
    raise exception 'the cinema owner membership cannot be modified';
  end if;

  if new.role = 'owner' then
    raise exception 'a cinema owner membership cannot be created through update';
  end if;

  -- Trusted server operations and platform administrators may manage
  -- non-owner memberships.
  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  -- Membership identity and granted authority are immutable during status
  -- transitions.
  if new.id is distinct from old.id
     or new.cinema_id is distinct from old.cinema_id
     or new.user_id is distinct from old.user_id
     or new.role is distinct from old.role
     or new.permissions is distinct from old.permissions
     or new.invited_by is distinct from old.invited_by
     or new.created_at is distinct from old.created_at then
    raise exception 'membership identity, role, and permissions cannot be changed';
  end if;

  -- A user may only accept their own pending invitation.
  if auth.uid() = old.user_id
     and old.status = 'invited'
     and new.status = 'active' then
    return new;
  end if;

  -- An owner or authorized manager may revoke a non-owner membership.
  if can_manage_cinema_staff(old.cinema_id)
     and old.status in ('invited', 'active')
     and new.status = 'revoked' then
    return new;
  end if;

  raise exception 'not authorized to update this cinema staff membership';
end;
$$;

drop trigger if exists cinema_staff_enforce_update_scope on cinema_staff;

create trigger cinema_staff_enforce_update_scope
before update on cinema_staff
for each row execute function enforce_cinema_staff_update_scope();

-- Replace the insert policy so no client can create another owner membership.
drop policy if exists cinema_staff_insert on cinema_staff;

create policy cinema_staff_insert on cinema_staff
for insert
with check (
  role in ('manager', 'staff')
  and (
    is_platform_admin()
    or (
      can_manage_cinema_staff(cinema_id)
      and invited_by = auth.uid()
      and status = 'invited'
    )
  )
);