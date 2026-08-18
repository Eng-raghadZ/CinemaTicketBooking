-- Allow an authenticated user to see a cinema while they have a pending
-- invitation to that specific cinema. This is required to display the cinema
-- name before accepting the invite.

create or replace function has_pending_cinema_invite(target_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cinema_staff
    where cinema_id = target_cinema_id
      and user_id = auth.uid()
      and status = 'invited'
  );
$$;

revoke all on function has_pending_cinema_invite(uuid) from public;
grant execute on function has_pending_cinema_invite(uuid)
  to authenticated, service_role;

create policy cinemas_select_own_pending_invite
on cinemas
for select
to authenticated
using (has_pending_cinema_invite(id));