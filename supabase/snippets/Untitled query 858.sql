select
  c.id,
  c.name,
  c.status,
  c.primary_owner_id,
  au.email as owner_email,
  (select count(*) from screens s where s.cinema_id = c.id) as screens_count,
  (select count(*) from showtimes sh where sh.cinema_id = c.id) as showtimes_count,
  (select count(*) from cinema_movies cm where cm.cinema_id = c.id) as movies_count,
  (select count(*) from bookings b where b.cinema_id = c.id) as bookings_count
from cinemas c
left join auth.users au on au.id = c.primary_owner_id
where lower(c.name) in ('cinema a', 'cinema b')
order by c.name;