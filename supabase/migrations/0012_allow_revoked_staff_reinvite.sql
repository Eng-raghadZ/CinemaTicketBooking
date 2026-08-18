-- Allow an authorized staff manager to re-invite a revoked non-owner member,
-- while preserving the protections against self-escalation and owner changes.

create or replace function enforce_cinema_staff_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' then
    raise exception 'the cinema owner membership cannot be modified';
  end if;

  if new.role = 'owner' then
    raise exception 'a cinema owner membership cannot be created through update';
  end if;

  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  -- The invited user may only accept their own invitation.
  if auth.uid() = old.user_id
     and old.status = 'invited'
     and new.status = 'active'
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions
     and new.invited_by is not distinct from old.invited_by
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- An authorized owner/manager may revoke a non-owner membership.
  if can_manage_cinema_staff(old.cinema_id)
     and old.status in ('invited', 'active')
     and new.status = 'revoked'
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions
     and new.invited_by is not distinct from old.invited_by
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- A revoked non-owner may be invited again. Role and permissions can be
  -- selected again, but identity and cinema ownership cannot change.
  if can_manage_cinema_staff(old.cinema_id)
     and old.status = 'revoked'
     and new.status = 'invited'
     and new.role in ('manager', 'staff')
     and new.invited_by = auth.uid()
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  raise exception 'not authorized to update this cinema staff membership';
end;
$$;