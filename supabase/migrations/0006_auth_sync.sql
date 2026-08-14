-- 0006_auth_sync.sql
-- Keeps public.users / public.user_roles in sync with Supabase's auth.users.
-- Every real Supabase project has an `auth` schema out of the box; this
-- migration is guarded so it's a safe no-op when applied against a plain
-- Postgres instance (e.g. local/CI testing — see tests/integration/setup.ts,
-- which inserts directly into public.users instead).

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth')
     and exists (select 1 from information_schema.tables
                 where table_schema = 'auth' and table_name = 'users') then

    execute $sql$
      create or replace function public.handle_new_auth_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $fn$
      begin
        insert into public.users (id, email, full_name)
        values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
        on conflict (id) do nothing;

        -- Every new user starts as a plain customer. Elevating to
        -- cinema_owner/platform_admin is a deliberate, separate admin action
        -- (Phase 8 tooling) — this trigger must never assign anything else,
        -- which is what prevents signup-time self-escalation.
        insert into public.user_roles (user_id, role)
        values (new.id, 'customer')
        on conflict (user_id) do nothing;

        return new;
      end;
      $fn$;
    $sql$;

    execute $sql$
      drop trigger if exists on_auth_user_created on auth.users;
      create trigger on_auth_user_created
        after insert on auth.users
        for each row execute function public.handle_new_auth_user();
    $sql$;

    raise notice 'auth.users trigger installed';
  else
    raise notice 'auth schema not found — skipping Supabase auth sync trigger (expected in local/CI Postgres)';
  end if;
end;
$$;
