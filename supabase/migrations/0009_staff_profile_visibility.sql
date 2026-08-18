-- Allow cinema staff managers to view the basic user records of people who
-- belong to cinemas they are authorized to manage.
--
-- SECURITY DEFINER avoids RLS recursion while keeping the outer users query
-- protected by its policy.

create or replace function can_view_managed_staff_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cinema_staff target_membership
    where target_membership.user_id = target_user_id
      and can_manage_cinema_staff(target_membership.cinema_id)
  );
$$;

revoke all on function can_view_managed_staff_user(uuid) from public;
grant execute on function can_view_managed_staff_user(uuid)
  to authenticated, service_role;

create policy users_select_managed_cinema_staff
on users
for select
to authenticated
using (can_view_managed_staff_user(id));