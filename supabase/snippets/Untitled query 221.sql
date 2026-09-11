begin;

do $$
begin
  if (
    select count(*)
    from cinemas
    where lower(name) in ('cinema a', 'cinema b')
  ) <> 2 then
    raise exception 'Expected exactly Cinema A and Cinema B; deletion cancelled';
  end if;

  if exists (
    select 1
    from bookings b
    join cinemas c on c.id = b.cinema_id
    where lower(c.name) in ('cinema a', 'cinema b')
  ) then
    raise exception 'Bookings exist; deletion cancelled';
  end if;
end
$$;

delete from cinemas
where lower(name) in ('cinema a', 'cinema b')
returning id, name;

commit;