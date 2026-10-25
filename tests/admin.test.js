import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { demoListings } from "../scripts/demo-data.mjs";

test("upgrade preserves data and secures admin moderation and demo isolation", async (t) => {
  const db = new PGlite();
  const seller = "11111111-1111-4111-8111-111111111111",
    buyer = "22222222-2222-4222-8222-222222222222",
    admin = "33333333-3333-4333-8333-333333333333",
    demo = "44444444-4444-4444-8444-444444444444";
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  async function asUser(id) {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  const insert = async (id, name = "Real lamp") =>
    (
      await q(
        "insert into listings(seller_id,name,category,condition,price,residence,pickup,description) values($1,$2,'Lamps','Good',50000,'Newton Kost',array['Today'],'Original description') returning *",
        [id, name],
      )
    )[0];
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609210001_kostcycle_multiuser.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const id of [seller, buyer, admin, demo])
      await q("insert into auth.users values($1,$2)", [
        id,
        JSON.stringify({ name: "Student", role: "admin", is_demo: true }),
      ]);
    const original = await insert(seller);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610120001_feedback_admin_demo.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test(
      "additive migration keeps every original field, ignores user metadata roles",
      async () => {
        const migrated = (
          await q("select * from listings where id=$1", [original.id])
        )[0];
        for (const key of Object.keys(original))
          assert.deepEqual(migrated[key], original[key]);
        assert.equal(migrated.is_demo, false);
        assert.equal(migrated.archived_at, null);
        assert.ok(
          (await q("select role,is_demo from profiles")).every(
            (p) => p.role === "student" && !p.is_demo,
          ),
        );
      },
    );
    await q("update profiles set role='admin' where id=$1", [admin]);
    await t.test(
      "explicit API grants and RLS do not depend on automatic public grants",
      async () => {
        const privileges = (
          await q(`select
        has_function_privilege('anon','public.is_kostcycle_admin()','EXECUTE') as anon_check,
        has_function_privilege('authenticated','public.moderate_listing(uuid,boolean)','EXECUTE') as student_rpc,
        has_function_privilege('anon','public.moderate_listing(uuid,boolean)','EXECUTE') as anon_rpc,
        has_function_privilege('anon','public.my_pickup_codes()','EXECUTE') as anon_codes,
        has_function_privilege('authenticated','kostcycle_private.guard_reservation_catalog()','EXECUTE') as private_guard,
        has_column_privilege('authenticated','public.profiles','role','UPDATE') as self_promote,
        has_column_privilege('authenticated','public.listings','archived_at','UPDATE') as archive_column`)
        )[0];
        assert.deepEqual(privileges, {
          anon_check: true,
          student_rpc: true,
          anon_rpc: false,
          anon_codes: false,
          private_guard: false,
          self_promote: false,
          archive_column: true,
        });
        assert.ok(
          (
            await q(
              "select relrowsecurity from pg_class where oid in ('public.profiles'::regclass,'public.listings'::regclass,'public.reservations'::regclass,'public.saved_items'::regclass,'kostcycle_private.pickup_secrets'::regclass)",
            )
          ).every((row) => row.relrowsecurity),
        );
        // Exercise the optional seed with NO implicit service_role table grants.
        // Roll back these local probe rows before the remaining transaction tests.
        await db.exec("begin; set local role service_role");
        try {
          await q("select id,role,is_demo from profiles limit 0");
          await q("select seed_key,is_demo,seller_id,archived_at from listings limit 0");
          await q("update profiles set is_demo=true where id=$1 returning id", [demo]);
          const sql = "insert into listings(seller_id,name,category,condition,price,residence,pickup,description,is_demo,seed_key) values($1,'Seed grant check','Lamps','Good',50000,'Newton Kost',array['Today'],'Seed privilege check',true,'grant-check') on conflict(seed_key) do nothing";
          await q(sql, [demo]);
          await q(sql, [demo]);
          assert.equal((await q("select seed_key from listings where seed_key='grant-check'")).length, 1);
        } finally {
          await db.exec("rollback");
        }
      },
    );
    await q("update profiles set is_demo=true where id=$1", [demo]);
    await asUser(seller);
    await t.test(
      "student cannot self-promote, mark demos, call moderation or bypass via direct update",
      async () => {
        await assert.rejects(
          q("update profiles set role='admin' where id=$1", [seller]),
          /permission denied/,
        );
        await assert.rejects(
          q("update profiles set is_demo=true where id=$1", [seller]),
          /permission denied/,
        );
        await assert.rejects(
          q("update listings set is_demo=true where id=$1", [original.id]),
          /permission denied/,
        );
        await assert.rejects(
          q("select moderate_listing($1,true)", [original.id]),
          /Admin access/,
        );
        await assert.rejects(
          q("update listings set archived_at=now() where id=$1", [original.id]),
          /Admin access/,
        );
      },
    );
    await asUser(admin);
    await t.test(
      "admin can archive and restore but cannot edit another seller content",
      async () => {
        assert.equal(
          (await q("select is_kostcycle_admin() as allowed"))[0].allowed,
          true,
        );
        await assert.rejects(
          q("update listings set description='Rewritten' where id=$1", [
            original.id,
          ]),
          /Only the seller/,
        );
        await q("select moderate_listing($1,true)", [original.id]);
        const row = (
          await q("select * from listings where id=$1", [original.id])
        )[0];
        assert.equal(row.archived_by, admin);
        assert.ok(row.archived_at);
        await asUser(buyer);
        assert.equal(
          (await q("select * from listings where id=$1", [original.id])).length,
          0,
        );
        await assert.rejects(
          q("select reserve_item($1,'Today')", [original.id]),
          /archived/,
        );
        await asUser(admin);
        await q("select moderate_listing($1,false)", [original.id]);
      },
    );
    await asUser(buyer);
    await q("select reserve_item($1,'Today')", [original.id]);
    const code = (await q("select * from my_pickup_codes()"))[0].code;
    await asUser(admin);
    await t.test(
      "admin reads transactions, not private codes; cannot disrupt or complete unrelated pickup",
      async () => {
        assert.equal((await q("select * from reservations")).length, 1);
        assert.equal((await q("select * from my_pickup_codes()")).length, 0);
        await assert.rejects(
          q("select moderate_listing($1,true)", [original.id]),
          /missing or already reserved/,
        );
        await assert.rejects(
          q("select confirm_handoff($1,$2)", [original.id, code]),
          /Only this listing/,
        );
        await assert.rejects(
          q("select * from kostcycle_private.pickup_secrets"),
          /permission denied/,
        );
      },
    );
    await asUser(seller);
    await q("select confirm_handoff($1,$2)", [original.id, code]);
    await db.exec("reset role");
    await t.test(
      "100 seeded rows are idempotent and cannot affect real transactions or impact",
      async () => {
        const before = (
          await q("select * from listings where id=$1", [original.id])
        )[0];
        async function seed() {
          for (const row of demoListings)
            await q(
              "insert into listings(seller_id,seed_key,is_demo,name,category,condition,price,residence,distance,pickup,description) values($1,$2,true,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(seed_key) do nothing",
              [
                demo,
                row.seed_key,
                row.name,
                row.category,
                row.condition,
                row.price,
                row.residence,
                row.distance,
                row.pickup,
                row.description,
              ],
            );
        }
        await seed();
        await seed();
        assert.equal(
          (await q("select * from listings where is_demo")).length,
          100,
        );
        assert.deepEqual(
          (await q("select * from listings where id=$1", [original.id]))[0],
          before,
        );
        const example = (
          await q("select * from listings where is_demo limit 1")
        )[0];
        await asUser(buyer);
        await assert.rejects(
          q("select reserve_item($1,$2)", [example.id, example.pickup[0]]),
          /Demo listings/,
        );
        const completed = await q(
          "select * from reservations where status='COMPLETED'",
        );
        assert.equal(completed.length, 1);
        assert.equal(Number(completed[0].estimated_weight), 1);
        assert.equal(
          (
            await q("select * from reservations where listing_id=$1", [
              example.id,
            ])
          ).length,
          0,
        );
      },
    );
    await t.test(
      "new signups cannot forge roles using metadata after upgrade",
      async () => {
        await db.exec("reset role");
        const id = "55555555-5555-4555-8555-555555555555";
        await q("insert into auth.users values($1,$2)", [
          id,
          JSON.stringify({ name: "Forged role", role: "admin", is_demo: true }),
        ]);
        await asUser(id);
        assert.equal(
          (await q("select role from profiles where id=$1", [id]))[0].role,
          "student",
        );
        assert.equal((await q("select * from reservations")).length, 0);
        assert.equal(
          (await q("select is_kostcycle_admin() as allowed"))[0].allowed,
          false,
        );
      },
    );
  } finally {
    await db.close();
  }
});
