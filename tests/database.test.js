import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { filterListings } from "../src/utils/marketplace.js";
import { weights } from "../src/data/catalog.js";

test("browse filters preserve search, availability, free, saved and price sorting", () => {
  const listings = [
    {
      id: "a",
      name: "Desk lamp",
      category: "Lamps",
      residence: "Newton Kost",
      description: "Good",
      price: 20000,
      condition: "Good",
      distance: 150,
      status: "AVAILABLE",
    },
    {
      id: "b",
      name: "Fan",
      category: "Fans",
      residence: "Other",
      description: "Free fan",
      price: 0,
      condition: "Fair",
      distance: 950,
      status: "RESERVED",
    },
  ];
  assert.equal(
    filterListings(listings, {
      q: "DESK",
      category: "Lamps",
      condition: "Good",
      price: "under50",
      distance: "250",
      available: "1",
    })[0].id,
    "a",
  );
  assert.equal(filterListings(listings, { price: "free" })[0].id, "b");
  assert.equal(filterListings(listings, { sort: "price" })[0].id, "b");
  assert.equal(filterListings(listings, { saved: [] }).length, 0);
});

test("complete migration: real PostgreSQL constraints, RLS, RPC ownership and pickup privacy", async (t) => {
  const db = new PGlite();
  const seller = "11111111-1111-4111-8111-111111111111";
  const buyer = "22222222-2222-4222-8222-222222222222";
  const other = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${other}', '{"name":"Existing student"}');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609210001_kostcycle_multiuser.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610120001_feedback_admin_demo.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values ($1,$2),($3,$4)", [
      seller,
      JSON.stringify({
        name: "Seller",
        university: "BINUS University",
        campus: "Alam Sutera",
        residence: "Newton Kost",
      }),
      buyer,
      JSON.stringify({ name: "Buyer" }),
    ]);
    const asUser = async (id) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    const query = async (sql, args = []) => (await db.query(sql, args)).rows;
    await t.test(
      "signup trigger, existing account backfill, estimate parity and publication",
      async () => {
        assert.equal((await query("select * from public.profiles")).length, 3);
        for (const [category, weight] of Object.entries(weights))
          assert.equal(
            Number(
              (
                await query(
                  "select public.kostcycle_category_weight($1) as weight",
                  [category],
                )
              )[0].weight,
            ),
            weight,
          );
        const tables = await query(
          "select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime'",
        );
        assert.equal(tables.length, 4);
        assert.ok(tables.every((row) => row.schemaname === "public"));
      },
    );
    await asUser(seller);
    const item = (
      await query(
        "insert into listings(seller_id,name,category,condition,price,residence,pickup,description) values($1,'Desk lamp','Lamps','Good',35000,'Newton Kost',array['Today','Tomorrow'],'Ready to reuse') returning *",
        [seller],
      )
    )[0];
    await t.test(
      "self edits allowed; lifecycle columns and self reservation denied",
      async () => {
        assert.equal(item.status, "AVAILABLE");
        assert.equal(Number(item.estimated_weight), 1);
        await query("update profiles set name='Updated seller' where id=$1", [
          seller,
        ]);
        await assert.rejects(
          query("update profiles set verified=false where id=$1", [seller]),
          /permission denied/,
        );
        await assert.rejects(
          query("update listings set status='COMPLETED' where id=$1", [
            item.id,
          ]),
          /permission denied/,
        );
        await assert.rejects(
          query("select reserve_item($1,'Today')", [item.id]),
          /own listing/,
        );
        await query(
          "update listings set description='Edited safely' where id=$1",
          [item.id],
        );
      },
    );
    await asUser(buyer);
    await t.test(
      "other user cannot edit seller profile/listing or forge ownership",
      async () => {
        assert.equal(
          (
            await query(
              "update listings set name='Hacked' where id=$1 returning id",
              [item.id],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await query(
              "update profiles set name='Hacked' where id=$1 returning id",
              [seller],
            )
          ).length,
          0,
        );
        await assert.rejects(
          query(
            "insert into listings(seller_id,name,category,condition,price,residence,pickup,description) values($1,'Forged','Lamps','Good',0,'Newton Kost',array['Today'],'No')",
            [seller],
          ),
          /row-level security/,
        );
        await assert.rejects(
          query("select reserve_item($1,'This weekend')", [item.id]),
          /available pickup/,
        );
      },
    );
    await query("select reserve_item($1,'Tomorrow')", [item.id]);
    const code = (await query("select * from my_pickup_codes()"))[0].code;
    await t.test(
      "reservation persists; buyer alone can read code; direct writes denied",
      async () => {
        assert.match(code, /^[0-9]{4}$/);
        assert.equal(
          (await query("select status from listings where id=$1", [item.id]))[0]
            .status,
          "RESERVED",
        );
        assert.equal(
          (await query("select * from reservations where status='COMPLETED'"))
            .length,
          0,
        );
        await assert.rejects(
          query("select * from kostcycle_private.pickup_secrets"),
          /permission denied/,
        );
        await assert.rejects(
          query("update reservations set status='COMPLETED'"),
          /permission denied/,
        );
        await assert.rejects(
          query("select confirm_handoff($1,$2)", [item.id, code]),
          /Only this listing/,
        );
      },
    );
    await asUser(other);
    await t.test(
      "second buyer cannot reserve, see private transaction or complete it",
      async () => {
        await assert.rejects(
          query("select reserve_item($1,'Today')", [item.id]),
          /no longer available/,
        );
        assert.equal((await query("select * from reservations")).length, 0);
        assert.equal(
          (await query("select * from my_pickup_codes()")).length,
          0,
        );
        await assert.rejects(
          query("select confirm_handoff($1,$2)", [item.id, code]),
          /Only this listing/,
        );
      },
    );
    await asUser(seller);
    await t.test(
      "seller cannot read code or edit/delete reserved item; wrong codes rate limited",
      async () => {
        assert.equal(
          (await query("select * from my_pickup_codes()")).length,
          0,
        );
        assert.equal((await query("select * from reservations")).length, 1);
        assert.equal(
          (
            await query(
              "update listings set price=1 where id=$1 returning id",
              [item.id],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await query("delete from listings where id=$1 returning id", [
              item.id,
            ])
          ).length,
          0,
        );
        for (let attempt = 0; attempt < 5; attempt++)
          assert.equal(
            (
              await query("select confirm_handoff($1,'0000') as result", [
                item.id,
              ])
            )[0].result.ok,
            false,
          );
        const locked = (
          await query("select confirm_handoff($1,$2) as result", [
            item.id,
            code,
          ])
        )[0].result;
        assert.equal(locked.ok, false);
        assert.match(locked.message, /15 minutes/);
      },
    );
    await db.exec(
      "reset role; update kostcycle_private.pickup_secrets set locked_until=now()-interval '1 minute'",
    );
    await asUser(seller);
    await t.test(
      "correct code completes both records once and deletes secret",
      async () => {
        assert.equal(
          (
            await query("select confirm_handoff($1,$2) as result", [
              item.id,
              code,
            ])
          )[0].result.ok,
          true,
        );
        assert.equal(
          (await query("select status from listings where id=$1", [item.id]))[0]
            .status,
          "COMPLETED",
        );
        const completed = await query(
          "select * from reservations where status='COMPLETED'",
        );
        assert.equal(completed.length, 1);
        assert.ok(completed[0].completed_at);
        assert.equal(Number(completed[0].estimated_weight), 1);
        await assert.rejects(
          query("select confirm_handoff($1,$2)", [item.id, code]),
          /no longer awaiting/,
        );
        await db.exec("reset role");
        assert.equal(
          (await query("select * from kostcycle_private.pickup_secrets"))
            .length,
          0,
        );
      },
    );
    await asUser(buyer);
    await t.test(
      "buyer sees completion; saved items isolated; anonymous cannot reserve",
      async () => {
        assert.equal(
          (await query("select status from reservations"))[0].status,
          "COMPLETED",
        );
        assert.equal(
          (await query("select * from my_pickup_codes()")).length,
          0,
        );
        await query(
          "insert into saved_items(user_id,listing_id) values($1,$2)",
          [buyer, item.id],
        );
        await asUser(seller);
        assert.equal((await query("select * from saved_items")).length, 0);
        await db.exec("reset role; set role anon");
        assert.equal((await query("select * from listings")).length, 1);
        await assert.rejects(
          query("select * from reservations"),
          /permission denied/,
        );
        await assert.rejects(
          query("select reserve_item($1,'Today')", [item.id]),
          /permission denied/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
