select
  now() as database_now,
  m.title,
  s.starts_at,
  m.duration_minutes,
  s.starts_at + (m.duration_minutes * interval '1 minute') as ends_at,
  case
    when now() < s.starts_at then 'UPCOMING'
    when now() < s.starts_at + (m.duration_minutes * interval '1 minute')
      then 'SHOWING NOW'
    else 'ENDED'
  end as show_status
from showtimes s
join movies m on m.id = s.movie_id
order by s.starts_at desc;