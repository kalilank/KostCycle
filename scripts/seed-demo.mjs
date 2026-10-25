// Optional, Node-only administrative script. NEVER import this from src/.
import process, { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { demoListings, demoSellers, seedNamespace } from "./demo-data.mjs";

const args = process.argv.slice(2);
async function main() {
  if (!args.includes("--apply")) {
    console.log(
      `Dry run: ${demoListings.length} browse-only listings across ${demoSellers.length} banned synthetic sellers. No database requests made. Use --apply --project-ref YOUR_PROJECT_REF to seed.`,
    );
    return;
  }
  try {
    loadEnvFile(".env.seed.local");
  } catch (e) {
    if (e.code !== "ENOENT")
      throw new Error("Could not load the local seed environment.");
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = args[args.indexOf("--project-ref") + 1];
  if (
    !url ||
    !secret ||
    !args.includes("--project-ref") ||
    new URL(url).hostname !== `${projectRef}.supabase.co` ||
    new URL(url).protocol !== "https:"
  )
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally, and pass the exact --project-ref. No secrets should use a VITE_ prefix.",
    );
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const check = (result) => {
    if (result.error)
      throw new Error(
        `Seed request failed (${result.error.code || result.error.status || "database/auth"}). Check the migration and local key; no records were deleted.`,
      );
    return result.data;
  };
  // Check new schema BEFORE creating any Auth users.
  check(
    await client
      .from("listings")
      .select("seed_key,is_demo,archived_at")
      .limit(0),
  );
  check(await client.from("profiles").select("role,is_demo").limit(0));
  const users = [];
  for (let page = 1; ; page++) {
    const data = check(
      await client.auth.admin.listUsers({ page, perPage: 200 }),
    );
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const ids = [];
  for (const seller of demoSellers) {
    let account = users.find((u) => u.email === seller.email);
    if (account && account.app_metadata?.seed_namespace !== seedNamespace)
      throw new Error(
        "Seed email collision with an unmarked account. Aborted without modifying that account.",
      );
    if (!account) {
      const data = check(
        await client.auth.admin.createUser({
          email: seller.email,
          password: randomBytes(48).toString("base64url"),
          email_confirm: true,
          ban_duration: "876000h",
          app_metadata: { seed_namespace: seedNamespace },
          user_metadata: {
            name: seller.name,
            residence: seller.residence,
            university: "BINUS University",
            campus: "Alam Sutera",
          },
        }),
      );
      account = data.user;
    }
    // Only accounts carrying the trusted seed namespace can be updated here.
    check(
      await client.auth.admin.updateUserById(account.id, {
        ban_duration: "876000h",
      }),
    );
    check(
      await client
        .from("profiles")
        .update({ is_demo: true })
        .eq("id", account.id)
        .select("id")
        .single(),
    );
    ids[seller.index] = account.id;
  }
  const existing = check(
    await client
      .from("listings")
      .select("seed_key,is_demo,seller_id")
      .in(
        "seed_key",
        demoListings.map((i) => i.seed_key),
      ),
  );
  if (existing.some((row) => !row.is_demo || !ids.includes(row.seller_id)))
    throw new Error(
      "Seed key collision with non-demo data. Aborted without changing that listing.",
    );
  const rows = demoListings.map(({ sellerIndex, ...listing }) => ({
    ...listing,
    seller_id: ids[sellerIndex],
  }));
  // ON CONFLICT DO NOTHING: reruns preserve existing content, archives and IDs.
  check(
    await client
      .from("listings")
      .upsert(rows, { onConflict: "seed_key", ignoreDuplicates: true }),
  );
  console.log(
    `Seed ready: ${rows.length} demo listing keys, ${ids.length} synthetic sellers. Existing listings were not overwritten. Demo pickups are blocked by the database.`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Seed failed.");
  process.exitCode = 1;
});
