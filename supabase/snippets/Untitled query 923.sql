select
  m.title,
  c.name as cinema,
  c.status as cinema_status,
  cm.is_enabled,
  s.starts_at,
  s.starts_at + (m.duration_minutes * interval '1 minute') as ends_at
from showtimes s
join movies m on m.id = s.movie_id
join screens sc on sc.id = s.screen_id
join cinemas c on c.id = sc.cinema_id
left join cinema_movies cm
  on cm.cinema_id = c.id
  and cm.movie_id = m.id
where now() < s.starts_at + (m.duration_minutes * interval '1 minute')
order by s.starts_at;