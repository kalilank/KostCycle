# Setting up a new Supabase project for KostCycle

The old project lost its tables, so KostCycle needs a fresh Supabase project.
This takes about 15 minutes. Do the steps in order. Nothing here needs the
secret `service_role` key.

> **Never** paste the secret / `service_role` key into `.env.local`, chat,
> GitHub or Vercel. The app only uses the **publishable** key.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Fill in:
   - **Name:** `KostCycle`
   - **Database password:** click **Generate**, then save it in your password
     manager. You will rarely need it.
   - **Region:** **Southeast Asia (Singapore)**, the closest to Alam Sutera.
4. Click **Create new project** and wait 1–2 minutes until it says the project
   is ready.

Free projects **pause after about a week without activity**. If the app
suddenly cannot reach the database, open the dashboard and click
**Restore project**.

## 2. Put the URL and publishable key in `.env.local`

1. In the project, open **Project Settings → API Keys** (or click **Connect**
   at the top).
2. Copy:
   - the **Project URL**, which looks like `https://abcdefghijkl.supabase.co`
   - the **Publishable key**, which starts with `sb_publishable_`
3. In the `KostCycle` folder, open `.env.local` (create it if it is missing)
   and make it exactly:

   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
   ```

4. Save, then stop and restart the dev server (`Ctrl+C`, then `npm run dev`).
   Vite only reads `.env.local` at startup.

`.env.local` is ignored by git, so it is never committed.

## 3. Create all tables, rules and storage (one paste)

1. In the dashboard, open **SQL Editor → New query**.
2. Open `supabase/all_migrations_for_new_project.sql` from this repo, copy
   **all** of it, paste it in, and click **Run**.
3. You should see **Success. No rows returned**.

That one file contains every migration, in this order:

| # | File | What it adds |
|---|------|--------------|
| 1 | `202609210001_kostcycle_multiuser.sql` | profiles, listings, reservations, saved items, pickup codes, security rules, Realtime |
| 2 | `202610120001_feedback_admin_demo.sql` | admin role, demo flags, moderation |
| 3 | `202610260001_binus_student_email.sql` | only `@binus.ac.id` emails can sign up |
| 4 | `202611210001_reservations_chat_images.sql` | cancel + 48 h expiry, buyer/seller chat, `listing-images` photo bucket, private saved interests |

You can also run the four files one by one in that order. **Run them only
once**, and never on a project that already has the tables.

Quick checks after running:

- **Table Editor**: `profiles`, `listings`, `reservations`, `saved_items`,
  `reservation_messages`, `profile_preferences`.
- **Storage**: a bucket called `listing-images`, marked **Public**.
- **Database → Publications → supabase_realtime**: listings, profiles,
  reservations, saved_items, reservation_messages.

## 4. Auth settings

Open **Authentication**.

1. **Sign In / Providers → Email**: make sure it is **enabled**.
2. **Confirm email**: choose one.
   - **On (recommended):** students must click a link sent to their BINUS
     inbox, which proves they own the address. Supabase's built-in email
     sender is heavily rate-limited and meant for testing. For real
     students, set up custom SMTP under **Authentication → Emails → SMTP
     Settings** (for example Resend or Brevo, both have free tiers).
   - **Off (quick class demo only):** sign-up works instantly, but nobody
     proves they own the BINUS inbox.
3. **URL Configuration**:
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs**, add each of these:
     - `http://localhost:5173/login`
     - `http://127.0.0.1:5173/login`
     - later, your Vercel URL, for example `https://kostcycle.vercel.app/login`

When the app is deployed, change **Site URL** to the Vercel URL and keep the
localhost entries for development.

## 5. Optional: load the demo catalog (100 sample items)

The old `npm run seed:demo` needs the secret service-role key. Use the SQL
version instead. It runs as the project owner inside the SQL Editor.

1. **SQL Editor → New query**.
2. Paste all of `supabase/seed_demo.sql`, then click **Run**.
3. The result row should read `demo_sellers 16`, `demo_listings 100`.

It is safe to run again: it never duplicates or deletes anything. The 16
sellers are locked accounts with no password and `.invalid` emails. Demo items
are labelled and **cannot be reserved**, so use real accounts to test a
pickup.

## 6. Make yourself an admin

1. Sign up in the app with your `@binus.ac.id` email (and confirm it if
   Confirm email is on).
2. In **SQL Editor**, run this with your email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where lower(email) = lower('YOU@binus.ac.id'))
     and not is_demo
   returning id, name, role;
   ```

3. Expect exactly one row. Reload the app and open `/admin`.

## 7. Later, on Vercel

In Vercel, open **Project → Settings → Environment Variables** and add both
variables for Production and Preview:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the same values as `.env.local`, then redeploy. Then add the Vercel URL to
Supabase **Authentication → URL Configuration** (step 4).

## 8. Checklist: does it work?

Run `npm run dev` and open <http://localhost:5173>.

- [ ] Home loads with **no red "Supabase" banner**.
- [ ] (If seeded) **Browse** shows the demo items.
- [ ] **Sign up** with a `@binus.ac.id` email. A non-BINUS email is refused.
- [ ] After signing in, the **"What are you hunting for?"** onboarding
      appears. Finish it, reload the page, and **Profile → Edit interests**
      still shows your picks (they are saved to your account now).
- [ ] With a **second BINUS account** (another browser or a private window),
      **Sell** an item with a photo. The photo appears, and in Storage →
      `listing-images` there is a file in a folder named after that user's id.
- [ ] With the first account, **Reserve** it. The pickup page shows **"… left
      to confirm the handoff"** and a **Messages** panel.
- [ ] Send messages both ways. They appear live, and the other account
      sees a **red dot on My Activity**.
- [ ] **Cancel reservation** works for either side, and the item shows as
      Available again.
- [ ] Reserve again, the buyer shows the code, the seller enters it, and the
      pickup shows **Completed**.

## Troubleshooting

| You see | Do this |
|---|---|
| "Database setup is incomplete" / `PGRST205` | The migrations did not run, or the API cache is stale. Run step 3, or run `notify pgrst, 'reload schema';` in the SQL Editor. |
| "Database update required" | A newer migration is missing. Run any files in `supabase/migrations` that you have not run yet, in order. |
| `binus_email_required` | Sign up with an `@binus.ac.id` address. |
| "Photo storage is not set up yet" | Migration 4 has not run (it creates the `listing-images` bucket). |
| Confirmation email never arrives | The built-in sender is rate-limited. Wait, or set up custom SMTP (step 4). |
| App suddenly cannot connect | The free project paused. Click **Restore project** in the dashboard. |

## For developers

- After adding or changing a migration, run `npm run build:sql` to regenerate
  `supabase/all_migrations_for_new_project.sql` and `supabase/seed_demo.sql`.
  `npm test` fails if they are out of date.
- `npm test` runs every migration against an in-memory PostgreSQL (PGlite).
  No real project is touched.
