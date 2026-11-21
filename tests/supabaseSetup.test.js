import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  buildAllMigrations,
  buildSeedSql,
} from "../scripts/build-supabase-sql.mjs";
import { demoListings, demoSellers } from "../scripts/demo-data.mjs";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8").then((s) =>
    s.replace(/\r\n/g, "\n"),
  );

// Closer to Supabase's real auth.users so the SQL seed is exercised as-is.
const AUTH_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(
    instance_id uuid, id uuid primary key, aud text, role text, email text unique,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
    created_at timestamptz, updated_at timestamptz, confirmation_token text,
    email_change text, email_change_token_new text, recovery_token text,
    banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

test("generated SQL files are up to date (run npm run build:sql)", async () => {
  assert.equal(
    await read("supabase/all_migrations_for_new_project.sql"),
    await buildAllMigrations(),
  );
  assert.equal(await read("supabase/seed_demo.sql"), buildSeedSql());
});

test("one-paste setup + demo seed work on an empty project and the seed is rerunnable", async () => {
  const db = new PGlite();
  try {
    await db.exec(AUTH_STUB);
    await db.exec(await read("supabase/all_migrations_for_new_project.sql"));
    const seed = await read("supabase/seed_demo.sql");
    await db.exec(seed);
    await db.exec(seed); // idempotent
    const count = async (sql) => (await db.query(sql)).rows[0].n;
    assert.equal(
      await count(
        "select count(*)::int as n from public.profiles where is_demo",
      ),
      demoSellers.length,
    );
    assert.equal(
      await count(
        "select count(*)::int as n from public.listings where is_demo",
      ),
      demoListings.length,
    );
    assert.equal(
      await count(
        "select count(*)::int as n from auth.users where banned_until > now() + interval '50 years' and encrypted_password = ''",
      ),
      demoSellers.length,
    );
    // Demo items stay browse-only for real students.
    const student = "44444444-4444-4444-8444-444444444444";
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'student@binus.ac.id','{\"name\":\"Student\"}')",
      [student],
    );
    const demo = (
      await db.query("select id from public.listings where is_demo limit 1")
    ).rows[0].id;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      student,
    ]);
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.reserve_item($1,'Today')", [demo]),
      /Demo listings are for browsing only|available pickup/,
    );
    await db.exec("reset role");
    // A real (non-demo) account using a seed email blocks the seed.
    const fresh = new PGlite();
    try {
      await fresh.exec(AUTH_STUB);
      await fresh.exec(
        await read("supabase/all_migrations_for_new_project.sql"),
      );
      // Simulate an unmarked account that already owns a seed email.
      await fresh.exec(
        "alter table auth.users disable trigger kostcycle_require_binus_email",
      );
      await fresh.query(
        "insert into auth.users(id,email) values(gen_random_uuid(),$1)",
        [demoSellers[0].email],
      );
      await fresh.exec(
        "alter table auth.users enable trigger kostcycle_require_binus_email",
      );
      await assert.rejects(fresh.exec(seed), /collision with a real account/);
      await fresh.exec("rollback"); // the SQL Editor rolls back failed runs itself
      assert.equal(
        (
          await fresh.query(
            "select count(*)::int as n from public.listings where is_demo",
          )
        ).rows[0].n,
        0,
        "nothing was inserted",
      );
    } finally {
      await fresh.close();
    }
  } finally {
    await db.close();
  }
});
