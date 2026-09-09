# Moviera homepage — design implementation

Scope: homepage only; existing authentication, routes, middleware and RLS are unchanged. No database migrations or new packages. Work branch: `ui/moviera-homepage`, based on `e5feb88`.

## Layout

Fixed transparent-to-dark header, cinematic hero, five equal-ratio movie cards, showtime finder, three equal-width cinema cards, booking banner and footer. At narrow widths navigation collapses, movie cards scroll horizontally, cinema cards stack, and the form changes to two then one column. Other sections remain below the fold.

The hero advances every five seconds, supports previous/next arrows and direct slide indicators, and stays synchronized with the Now Showing cards. Automatic movement pauses during hover or keyboard interaction and is disabled when the visitor requests reduced motion. Headings use a narrower system-font stack instead of Impact.

## Data and placeholders

- Existing session-aware Supabase client loads future-showtime movies at approved cinemas and approved cinema names. No service role is used.
- Without listings, clearly labelled sample content preserves the design for review. This is not a claim that sample movies or cinemas are bookable.
- Date and cinema filters submit to the existing `/showtimes` route. Location is a disabled visual placeholder.
- Booking buttons use `/booking-unavailable`. Trailers, reviews, notifications, policy/help and contact/social areas remain placeholders.
- Sign in, dashboard and sign out use existing authentication flows.
- This is a design-review iteration, not a completed live-data/E2E signoff. Query failures currently fall back to labelled samples; empty/error differentiation should be completed before production approval.

## Replace artwork

`public/images/moviera/hero.png` is generated temporary artwork, used in the hero, fallback posters, cinema cards and banner. Replace it with the supplied background, or provide separate paths in `components/homepage.tsx` and `components/homepage.module.css`. Catalog posters use `poster_url` where present. Image boxes use `object-fit: cover`; film cards are always 4:5 and cinema images 16:9 (16:8 on mobile). Preserve these ratios when replacing assets. The current film-placeholder color filters should be removed when final artwork is supplied.

## Validation

Run the project's lint, typecheck, unit tests and build. Live Supabase integration and browser checks across desktop/tablet/mobile are still required in the configured environment. No production deployment or remote branch push is performed by this change.
