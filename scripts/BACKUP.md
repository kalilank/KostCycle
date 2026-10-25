# Read-only data backup

From `C:\uni\sem5\venture\KostCycle` run:

```powershell
npm.cmd run backup:data
```

`npm run backup:data` also works where PowerShell allows npm.ps1. Requires Node 22.12+ and the existing `.env.seed.local` fields `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The file is read directly; credentials are never printed, put in filenames, or copied into the backups. Never import the scripts into the frontend.

Each run creates a unique timestamped directory under:

`C:\uni\sem5\venture\KostCycle-backups\`

It contains `profiles.json`, `listings.json`, `reservations.json`, `saved_items.json` and `manifest.json` with counts and SHA-256 hashes. Earlier backups are not overwritten. The destination is checked against the repository path, including symlink/junction resolution.

Only GET requests to the four named public tables are made. There are no mutations, Auth calls, RPCs, migrations, or permission changes. Pagination orders by primary keys (both keys for saved items), follows exact counts, and advances by the actual returned page length even if the server applies a smaller cap. All columns are selected. Raw JSON values are retained instead of rounding numbers, converting timestamps or replacing nulls; the string `"null"` and JSON `null` remain distinct.

A complete run prints only its destination and table row counts. Errors omit credentials and response bodies. Failed runs retain `.partial` files and/or `FAILED.json`; do not treat them as a complete backup. Only a valid `manifest.json` with `status: "complete"` indicates success. Restricted API access fails the export; the script never attempts to change database grants.

This is a sequential Data API export, **not a transactionally consistent snapshot**. Pause marketplace writes while running it if you need a consistent copy. Changed counts and duplicate pages are detected, but concurrent updates or offset shifts with unchanged totals cannot all be detected. Exact-count pagination follows [PostgREST's documented range/count behavior](https://docs.postgrest.org/en/stable/references/api/pagination_count.html).

The backup contains user data. Keep the external folder private and outside source control. POSIX permissions are restricted on newly created files/directories; Windows uses the destination's inherited ACLs. This does not include Auth accounts, schema, RLS/functions, Storage, or private pickup secrets, and is not a full database backup or automatic restore tool.

Verification without contacting Supabase:

```powershell
npm.cmd run lint
node --test tests/backup.test.js
npm.cmd run backup:data -- --help
```
