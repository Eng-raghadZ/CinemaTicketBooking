-- Separate artwork for wide movie heroes, portrait movie posters, and cinema covers.
-- Both columns are optional so existing catalog and cinema rows remain valid.

alter table movies
  add column hero_image_url text;

alter table movies
  add constraint movies_hero_image_url_valid
  check (
    hero_image_url is null
    or (
      char_length(hero_image_url) <= 2000
      and hero_image_url ~* '^https?://'
    )
  );

alter table cinemas
  add column cover_image_url text;

alter table cinemas
  add constraint cinemas_cover_image_url_valid
  check (
    cover_image_url is null
    or (
      char_length(cover_image_url) <= 2000
      and cover_image_url ~* '^https?://'
    )
  );
