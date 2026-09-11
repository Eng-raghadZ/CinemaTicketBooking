# Moviera homepage — design implementation

Scope: homepage design and its live catalog integration. Existing authentication, middleware and RLS remain unchanged. Migrations `0017_movie_trailer_url.sql` and `0018_catalog_artwork_urls.sql` add optional trailer and artwork URLs; no new package is required.

## Layout

Fixed transparent-to-dark header, cinematic hero, five equal-ratio movie cards, showtime finder, three equal-width cinema cards, booking banner and footer. At narrow widths navigation collapses, movie cards scroll horizontally, cinema cards stack, and the form changes to two then one column. Other sections remain below the fold.

The hero advances every eight seconds through unique movies with future showtimes, supports previous/next arrows and direct slide indicators, and displays each movie's nearest upcoming time. Its progress indicator and slide timer share the same eight-second cycle; manual navigation restarts both together. Automatic movement is disabled when the visitor requests reduced motion. Headings use a narrower system-font stack instead of Impact.

## Data and placeholders

- Existing session-aware Supabase client loads approved cinemas, currently running movies and the next 20 future showtimes; no service role is used.
- The hero promotes unique movies with future showtimes, ordered by their nearest screening. Now Showing contains only movies whose showtime has started but has not yet ended (`starts_at + duration_minutes`). Upcoming Showtimes contains future rows ordered by `starts_at`, including separate cards for separate screenings.
- Date and cinema filters submit to `/showtimes`; Location filters the real cinema options in the form.
- Hero actions open the real movie detail page and the catalog trailer URL. The trailer action is disabled when no URL is stored. Reviews, notifications, policy/help and contact/social areas remain placeholders.
- Sign in, dashboard and sign out use existing authentication flows.
- Public catalog pages remain available to visitors, while their shared navigation reflects the current session instead of always showing Sign in.
- This is a design-review iteration, not a completed live-data/E2E signoff. Query failures currently fall back to labelled samples; empty/error differentiation should be completed before production approval.

## Replace artwork

`public/images/moviera/hero.png` remains fallback artwork. Movie cards use `poster_url`, the hero uses `hero_image_url` with poster/fallback recovery, and Featured Cinemas uses `cover_image_url`. Image boxes use `object-fit: cover`; film cards remain portrait and cinema covers 16:9. Owners may update their own cinema cover, while platform administrators manage both movie artwork URLs.

## Validation

Run the project's lint, typecheck, unit tests and build. Live Supabase integration and browser checks across desktop/tablet/mobile are still required in the configured environment. No production deployment or remote branch push is performed by this change.
