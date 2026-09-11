select id, name
from cinemas
where lower(name) in ('cinema a', 'cinema b');