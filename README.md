# KostCycle

The existing React + Vite JavaScript marketplace, now connected to Supabase Auth, PostgreSQL, RLS, and Realtime. React Router, Lucide, plain CSS, and the original mustard / black / off-white interface are preserved.

## Required one-time database setup

Open your configured Supabase project → SQL Editor → New query. Paste and run the **entire** file:

`supabase/migrations/202609210001_kostcycle_multiuser.sql`

Run once as the project owner. The migration is transactional; a failed run rolls back. Do not run it again after a successful commit. It creates profiles, listings, reservations (also the transaction record), saved items, private pickup secrets, indexes, constraints, signup/backfill triggers, column grants, RLS, RPCs, and the Realtime publication. It does not seed mock marketplace data or delete existing auth accounts. If an existing unrelated table has one of these names, resolve that conflict before applying; do not drop user data.

The configured project's Data API was reachable, but its listings table was missing. No database admin connection or management credentials were available here, so this migration has **not been applied remotely**. A publishable frontend key cannot apply SQL. Never put a service-role/secret key in this app.

## Environment and run

`.env.local` must provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The existing file used NEXT_PUBLIC names, so Vite aliases referencing those same values were added without changing or exposing credentials. Restart Vite after environment changes. Use only a publishable key (or legacy anon key); privileged keys are rejected by the client setup.

```sh
npm install
npm run dev
npm run lint
npm test
npm run build
```

Open the URL printed by Vite. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`. No separate backend server is needed.

## Supabase dashboard settings

1. Under Authentication, enable the Email provider and allow new-user signups.
2. In Authentication → URL Configuration, set Site URL to the actual app origin, for example `http://127.0.0.1:5173`, and add `http://127.0.0.1:5173/login` to Redirect URLs. If using localhost, also add `http://localhost:5173/login`. Add exact deployed or LAN origins when testing elsewhere.
3. Keep Confirm Email enabled for real email ownership verification. The signup screen explains that users must check email before signing in. This is separate from the explicitly simulated university/student verification.
4. Configure custom SMTP if testing signups with emails outside your Supabase project team. Supabase's default sender restricts recipients and rates; see [official SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp). For an isolated classroom test only, you may intentionally disable Confirm Email; auth is still real, but email ownership will then not be verified. No setting was changed automatically.
5. Realtime is configured by the migration for public profiles, listings, reservations, and saved_items. Check those tables belong to `supabase_realtime` if live updates fail. Never expose `kostcycle_private` in Data API settings or add its table to Realtime.
6. No Storage bucket is required for this MVP. Uploaded JPG/PNG/WebP images (maximum 1.2 MB) are validated and stored with the listing as image data. A future larger marketplace should move uploads into Supabase Storage.

## Exact two-account test

1. Apply the migration and dashboard settings, run Vite, and click Retry or reload. The marketplace starts empty.
2. Open browser A normally and browser B in a separate browser profile, another browser, or a private window. Two ordinary tabs in the same profile share the auth session and are not two accounts.
3. In A, Sign Up with student A's real email, password (at least eight characters), name, university, campus, and residence. Confirm email if enabled, then Sign In in A.
4. In B, repeat with a different real email for student B. Confirm email and Sign In in B. Open confirmation links in their intended browser, or sign in again in the correct browser afterward.
5. In A, Sell / Give Away → create a Lamps listing with price or free status, description, residence, image, and Today pickup. In My Listings, edit an available listing to verify owner editing. Leave this page open.
6. In B, find that listing through Browse/search/filter/sort, open it, and reserve Today. My Reservations shows the pickup location, date and four-digit code. Impact must still be zero for this transaction.
7. Without refreshing A, its listing should become Reserved and show B as the buyer. A sees a Confirm handoff button, **not** B's code.
8. A clicks Confirm handoff and tries `0000` once. It must fail without changing state. Then enter the code shown in B and confirm. Five consecutive incorrect attempts lock verification for 15 minutes.
9. Without refreshing B, the reservation becomes Completed. Both accounts' Completed and Impact pages show one completed handoff, one reused item, and **estimated 1.0 kg** for the lamp. The active pickup code disappears.
10. Refresh both browsers: database state remains. Sign out/in: each account keeps its own activity and saved items. Repeat with roles reversed to confirm there are no permanent buyer/seller roles.
11. A must not be able to reserve A's own item. A reserved item cannot be reserved again, edited, or deleted through the app. A third account cannot see another pair's reservation or complete it. The local database tests also verify these restrictions below the UI.

For separate physical devices, run `npm run dev -- --host 0.0.0.0` on a trusted LAN and use the host computer's LAN IP and Vite port on both devices; localhost on a phone refers to the phone. Allow the Vite port through your firewall only on the trusted network. Add that exact origin/login redirect in Supabase. Prefer an HTTPS deployment for use beyond local testing.

## Security and synchronization

- The database derives the acting user from the authenticated JWT, not from a supplied buyer/seller role.
- Listing creation/editing and profile editing have both RLS and restricted column grants. Clients cannot set listing lifecycle fields or verified status.
- Reservation RPC locks the listing row and checks availability and ownership. A unique reservation constraint prevents duplicates. No direct reservation writes are granted to clients.
- Handoff RPC checks seller ownership, validates the private code with attempt limits, and atomically completes both records. Only the buyer can retrieve their active code; it is not stored in public tables or published in Realtime.
- Completed reservations are the only impact source, with category-weight snapshots taken at reservation. There is no separately mutable impact counter.
- Public listing/profile fields are readable for browsing; profiles contain name, university, campus, residence and simulated verification, never email. Reservation details and saved items are account-scoped.
- Realtime invalidates/refetches data, with refresh on reconnect/focus/online and a 30-second reconciliation fallback. Offline writes are rejected, not simulated. Initial and setup errors include Retry.
- Old localStorage marketplace persistence, demo users, seed listings, reset controls, and Demo Seller View were removed. Any old browser demo entry is ignored, not imported or deleted. Only Supabase's standard auth session persists locally.

## Verification and remaining limits

`npm test` executes the exact migration in PGlite (embedded PostgreSQL) with Supabase-style authenticated/anon roles and auth identity, then tests signup/backfill, RLS, grants, code privacy, duplicate prevention, failed-code lockout, atomic completion and impact weight parity. It also checks browse filters. These tests do not emulate hosted Supabase Auth or Realtime transport.

Lint and production build pass. Vite runs; Home, Sign In, Sign Up, and the explicit missing-schema state were checked in the browser. **Live two-account Auth/Realtime testing still requires applying the remote migration and creating the two accounts.**

University verification is simulated and labelled. Distances/walking times are illustrative residence-based estimates, not GPS. Impact weights are category estimates: Fans 2.5 kg, Lamps 1.0 kg, Storage 1.2 kg, Furniture 5.0 kg, Kitchen 1.0 kg, Electronics 1.5 kg, Other Essentials 1.0 kg. Catalog photos are illustrative unless replaced with an upload. Payments remain arranged outside the app. No chat, cancellation, shipping, or payment gateway is implemented.

## Product imagery

`public/products.png` is a locally stored illustrative catalog contact sheet created with the built-in image generation tool, displayed as twelve product photographs. Product detail screens label demo imagery. The image-generation skill was used for this asset. Fonts use Host Grotesk from Google Fonts with system fallbacks; product imagery does not depend on an external API.

Generation prompt: “Create one catalog photography contact sheet for a student secondhand essentials marketplace. Exact layout: 4 equal columns and 3 equal rows, twelve equally sized square panels, no gutters, no borders, no text. Each panel has a single centered complete object occupying 65% of panel with generous breathing room, photographed on a uniform warm light-gray seamless studio backdrop, soft natural shadows, realistic modest affordable used products, polished editorial retail photography. Reading left to right: Row 1: black adjustable desk lamp; white standing pedestal fan; translucent plastic storage box with beige lid; white compact rice cooker. Row 2: small light oak study table; white coiled extension cable power strip; small light oak three-tier shelf; brushed stainless electric kettle. Row 3: compact white desk fan; stack of three neutral ceramic mugs; mustard yellow cotton cushion; small black portable bluetooth speaker. Exactly 4 columns x 3 rows, every object entirely contained in its own panel, no overlap, no people, no branding, no captions. High quality large landscape image.”
