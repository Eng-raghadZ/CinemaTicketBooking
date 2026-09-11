select
  c.id,
  c.name,
  count(b.id) as bookings_count
from cinemas c
left join bookings b on b.cinema_id = c.id
where lower(c.name) in ('cinema a', 'cinema b')
group by c.id, c.name
order by c.name;