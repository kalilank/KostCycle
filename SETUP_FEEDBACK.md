# Interview-feedback upgrade

This is an incremental React/Vite/Supabase upgrade. No deployment, remote migration, seed application, account promotion, production data edit, or secret change was performed automatically.

## 1. Apply the pending migration

Back up/check your project and preferably validate in staging first. In the intended Supabase project's SQL Editor, run the complete file once:

`supabase/migrations/202610120001_feedback_admin_demo.sql`

It adds student/admin roles, demo markers, archive metadata, indexes, RLS policies and guarded moderation/reservation functions. Existing records retain their content and receive student/non-demo defaults. It is transactional. Do not rerun after success.

The original `202609210001_kostcycle_multiuser.sql` is unchanged. **Do not rerun it on an already-initialized project.** Only a completely fresh database needs that original migration first, followed by the new migration. No additional Realtime tables or Auth settings are required by this upgrade. Keep the existing Email provider, confirmation policy and Realtime publication enabled; pickup secrets must stay private.

## 2. Promote one existing test account

Sign up normally first. Replace the email below with your existing test account's actual email, then run this in the trusted Supabase SQL Editor (never the frontend):

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_TEST_EMAIL@example.com')
)
and not is_demo
returning id, name, role;
```

Expect exactly one returned row. If zero, check the account email; do not broaden the query. Reload/sign in and open `/admin`. To revoke, use the same targeted statement with `role = 'student'`. Signup metadata cannot assign roles, and authenticated users have no UPDATE grant on role or is_demo. Admins may archive/restore AVAILABLE listings, but cannot read buyers' codes, edit other sellers' content, complete unrelated handoffs, or archive reserved/completed items.

## 3. Optional demo seed

The schema ties every seller profile to Auth, so this optional script creates **16 synthetic, banned Auth accounts and 100 browse-only listings**, not 100 real users. Random passwords are discarded, synthetic emails use `.invalid`, and no signup emails are sent. The script does not run at app startup or build time.

Use Node 22.12+ (the app's Vite runtime requirement). Preview without credentials or network requests:

```sh
npm run seed:demo
```

If you choose to populate a project, create `.env.seed.local` locally using `.env.seed.example` as the field guide. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the intended project yourself. `*.local` is gitignored. Never paste this key into chat, put it in `.env.local`, prefix it with `VITE_`, or add it to Vercel/frontend configuration.

After applying the migration, replace `YOUR_PROJECT_REF` with the exact project's reference:

```sh
npm run seed:demo -- --apply --project-ref YOUR_PROJECT_REF
```

The explicit reference must match the URL. Reruns reuse only trusted seed-marked accounts and insert missing stable listing keys with ON CONFLICT DO NOTHING. Existing content, archive choices and real users/listings are not overwritten or deleted. Partial failures can be retried. No automated cleanup/deletion is provided. Study and miscellaneous items use the existing Other Essentials category to preserve schema compatibility.

Demo labels are visible. Database guards prohibit demo listings or demo participants from making reservations. Admin operational totals exclude demo users/listings; completed-only impact cannot be inflated by the seed. Use two real test accounts and a real listing for transaction demonstrations.

## Photography and October 30 grant review

36 real Pexels photographs are checked in under `public/products/` (compressed JPEG, up to 960px square). Product type/category matching is deterministic across cards, detail pages and recommendations. Seller uploads always win. A small Illustrative chip and detail caption distinguish defaults from seller photos. There is no manual stock picker. The seed continues to store `image_data = null`: the frontend resolves local photography without changing existing database images or requiring a new image column. Photo credits/license/source URLs are in `public/products/SOURCES.md` and the machine-readable `src/data/productPhotos.js` manifest. No AI generation was used for these assets.

Supabase's [official October 30, 2026 announcement](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) changes automatic grants on future public tables; existing tables retain their grants and RLS still applies. This migration creates no public tables, views or sequences, so frontend table access is unaffected. The original migration already declares table/column grants explicitly and remains unchanged. The new migration now documents the review and explicitly resets/grants EXECUTE for both new public functions: the role-check helper is usable by anon/authenticated for RLS, and moderation is authenticated-only with a database admin check. Private trigger functions remain revoked from public/anon/authenticated. No blanket grants, student role-update permissions or pickup-secret access were added. Local privilege tests run without implicit Supabase table grants.

The optional local seed also now has explicit minimum `service_role` grants for profile demo marking, seed listing reads/inserts, and the pure category-weight helper. This makes seeding work even on a fresh project with automatic grants disabled. These trusted local/server-role grants never apply to anon/authenticated, and add no access to private pickup data. Existing service-role privileges are not revoked. The PostgreSQL tests exercise its actual preflight, update and idempotent insert operations without automatic grants.

## 4. Recommendation scoring

Deterministic content matching, **not trained machine learning**:

| Signal | Points |
| --- | ---: |
| Same category as current item | 5 |
| Category in recent views/reservations | 3 |
| Same known residence | 2 |
| Same condition | 1 |
| Price within 30%; free matches only free | 1 |

Consider the latest 20 viewed items and latest 10 reservations. Sort by score, then illustrative distance, newest listing, then ID for stable ties. Cold start falls back to same residence/nearby/recent available items. Exclude the current item, own items, reserved/completed and archived listings. Show up to four suggestions with short reasons. Only bounded, per-account preference history uses localStorage; marketplace state and saved items remain in Supabase. History stays on the current browser/device.

## 5. Manual acceptance test before pushing

1. Run `npm install`, `npm run lint`, `npm test`, `npm run build`, then `npm run dev`. Open Vite's printed URL. Windows can use `npm.cmd`.
2. After applying the pending migration, sign in as student A in one browser and student B in a separate profile/incognito browser. Verify normal email confirmation/login; do not use synthetic sellers. Open `/admin` as a student: access must be denied. Refresh to check persisted sessions.
3. A creates a real lamp (optional upload or labelled illustrative default), edits it while available, and leaves Activity open. B searches/filters/sorts, saves it, views Similar items, and reserves it. B should land on pickup details with location, window and private four-digit code. A sees Meet & exchange / Confirm handoff without B's code. A cannot reserve A's own listing.
4. After the physical exchange, A opens Confirm handoff and checks “I have physically handed the item to the buyer.” Verify that code entry is disabled before acknowledgement. Try an incorrect code once, then enter B's actual code. B must see Completed without refresh; the private code disappears. Both accounts' Impact gains one item and estimated 1.0 kg. Refresh both and check persisted completion. Repeat with seller/buyer reversed if desired. Payment is cash or direct transfer arranged between students; KostCycle does not process, verify or guarantee it. Free pickups require no payment.
5. Sign in as the promoted admin. Check real-user/listing/reservation/completed totals. Archive an AVAILABLE test listing: B must lose it from Browse/recommendations and cannot reserve it. Restore it. Reserved/completed listing moderation must be disabled. Admin must not see pickup codes or complete unrelated transactions.
6. Optionally apply the seed twice. Expect 100 unique demo listing keys and 16 synthetic sellers, unchanged real rows/totals, no duplicate content, and disabled demo reservations. Check lamps/fans/storage/furniture/kitchen/electronics/study/misc and free items.
7. At 320, 390, 768 and desktop widths, check Home/Browse/Sell/Activity/Profile/item/pickup/admin. Verify active navigation, Back fallback, bottom-nav clearance, no horizontal overflow, readable forms/cards and keyboard focus. Check blank-history and viewed-category recommendations.
8. Inspect `git diff --check`, `git diff --stat`, `git status --short` and the final diff. Confirm the original migration and production environment files are unchanged. `git check-ignore .env.local .env.seed.local` must show both local files are ignored; never stage credentials.
9. Commit/push only after the above checks. In Vercel use the existing Vite project, build `npm run build`, output `dist`, and existing `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`. Do NOT add the seed service-role key. `vercel.json` adds SPA deep-link rewrites. Check Preview first, including direct `/item/...` and `/admin` reloads, before manually promoting to production.
10. Supabase Auth URL Configuration must include the exact intended Preview/production login redirect origins for confirmation links; retain existing valid production entries. No URL/security setting was changed automatically.

## Verification and remaining simulations

- Final checks: lint passed with no warnings; production build passed; all 26 tests passed; seed dry-run reported 100 listings/16 sellers without making database requests. The build emits a non-blocking 500 kB chunk warning (about 552 kB minified, 160 kB gzip). Tests cover PostgreSQL/RLS, explicit grants, transaction, moderation, upgrade-preservation, seed isolation/idempotency, recommendation, photography and existing browse cases. They apply both exact migrations in PGlite; this is not hosted Auth/Realtime transport.
- Browser checks at 320, 390, 768 and 1280 px covered Home, Browse, Sell, Activity, Profile, item/pickup details and Admin. Fixed the 320px body minimum width and tablet Home negative-margin overflow. Verified desktop sticky header while scrolling, mobile active navigation, Back fallback, all 36 image assets, actual Sign In/Sign Up form rendering, student admin denial and authorized admin/moderation dialog. The isolated fixture also verified incorrect-code feedback and seller-to-buyer completion UI/updated admin totals. No hosted form submission or production moderation occurred.
- `tests/ui/index.html` is an explicitly labelled, dev-only isolated UI fixture using the real page components. It has no Supabase calls, is not imported by the production entry, and is not bundled by `vite build`. Its buyer/seller/admin selector is QA-only, not an application login or security bypass. Open it via the local Vite server to reproduce visual checks without touching production.
- Live student login, two-browser hosted Realtime, actual remote admin promotion and Auth-admin seeding remain manual checks: no test credentials or remote migration authority were used. Do not treat local fixtures as evidence those remote checks passed.
- Student/university verification remains simulated. Proximity/walking times and category impact weights remain estimates, not GPS or measured outcomes. The six visual steps are Browse → Reserve → Arrange Pickup → Meet & Exchange → Verify Pickup Code → Completed; the database still uses only AVAILABLE → RESERVED → COMPLETED. Physical handoff acknowledgement is local UI guidance, not independent proof of exchange or payment. Payments are arranged outside the app. Default photographs illustrate product types/categories; they do not depict the seller's exact item. Seed content is synthetic and browse-only.

## Main changed files

- Navigation/flow: `src/App.jsx`, `components/Header.jsx`, `BackButton.jsx`, `TransactionSteps.jsx`, `HandoffForm.jsx`, `pages/Activity.jsx`, `Profile.jsx`, `Reservation.jsx`.
- Catalog/mobile: `pages/Home.jsx`, `ProductDetail.jsx`, `Sell.jsx`, `Impact.jsx`, `components/UI.jsx`, `src/style.css`, `utils/marketplace.js`.
- Recommendations: `components/Recommendations.jsx`, `utils/recommendations.js`, `utils/viewHistory.js`, `context/AppProvider.jsx`.
- Administration/database: `pages/Admin.jsx`, `lib/marketplaceApi.js`, new migration above.
- Seed/QA/setup: `scripts/demo-data.mjs`, `scripts/seed-demo.mjs`, `.env.seed.example`, `tests/admin.test.js`, `tests/recommendations.test.js`, updated `tests/database.test.js`, `tests/ui/`, `package.json`, `vercel.json`, this guide and README.
