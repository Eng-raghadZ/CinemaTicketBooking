# Moviera cinemas UI

The `/cinemas` route uses the shared Moviera cinematic system while preserving the public Supabase and RLS boundary.

- Search filters use real cinema name, location, and country data.
- Ratings and experience badges are not fabricated because they are not present in the schema.
- Every cinema card opens its real `/cinemas/[cinemaId]` route.
- Pagination keeps active filters and the existing bounded query behavior.
