# Moviera authentication UI

The `/login` and `/signup` routes use the existing Supabase authentication flows with the approved Moviera dark cinema identity.

- Laptop layouts use a split composition with cinema artwork on the left and the form on the right.
- Tablet, iPad and phone layouts center the form in a dark panel over the artwork.
- The authentication shell is constrained to the available viewport height and compacts spacing on short screens so the document does not require vertical scrolling.
- Successful email/password and Google sign-ins return to the homepage. Signing out returns to `/login`.
- Google OAuth uses Supabase and requires the Google provider and redirect URL to be configured in the target environment.
- Signup requires a phone number and stores it in Supabase user metadata together with the existing full name.
- Password visibility controls on both authentication pages, validation messages and pending states are keyboard accessible.
- Form-field spacing is `12px` on laptop layouts and `8px` on tablet and phone layouts.

The shared artwork is stored at `public/images/moviera/auth-cinema.png`.
