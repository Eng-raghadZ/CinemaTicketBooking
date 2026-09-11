-- Add an optional trailer URL to the platform movie catalog.
-- Existing rows remain valid and unchanged. Only public HTTP(S) URLs are
-- accepted; application validation applies the same protocol and length rules.

alter table movies
  add column trailer_url text;

alter table movies
  add constraint movies_trailer_url_valid
  check (
    trailer_url is null
    or (
      char_length(trailer_url) <= 2000
      and trailer_url ~* '^https?://'
    )
  );
