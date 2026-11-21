import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = [
  "202609210001_kostcycle_multiuser.sql",
  "202610120001_feedback_admin_demo.sql",
  "202610260001_binus_student_email.sql",
  "202611210001_reservations_chat_images.sql",
];
const seller = "11111111-1111-4111-8111-111111111111";
const buyer = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";

// Minimal stand-ins for the Supabase auth and storage schemas.
const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text,
    raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select on storage.objects to anon, authenticated;
  grant insert, delete on storage.objects to authenticated;
`;

async function setup() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of MIGRATIONS)
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values
      ($1,'seller@binus.ac.id','{"name":"Seller"}'),
      ($2,'buyer@binus.ac.id','{"name":"Buyer"}'),
      ($3,'other@binus.ac.id','{"name":"Other"}')`,
    [seller, buyer, other],
  );
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec(id ? "set role authenticated" : "set role anon");
  };
  const admin = async (sql, args = []) => {
    await db.exec("reset role");
    return query(sql, args);
  };
  const listing = async (name = "Desk fan") => {
    await as(seller);
    return (
      await query(
        "insert into listings(seller_id,name,category,condition,price,residence,pickup,description) values($1,$2,'Fans','Good',50000,'Newton Kost',array['Today','Tomorrow'],'Works well') returning id",
        [seller, name],
      )
    )[0].id;
  };
  return { db, query, as, admin, listing };
}

test("all four migrations apply in order on a fresh database", async () => {
  const { db, admin } = await setup();
  try {
    const tables = await admin(
      "select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1",
    );
    assert.deepEqual(
      tables.map((r) => r.tablename),
      [
        "listings",
        "profiles",
        "reservation_messages",
        "reservations",
        "saved_items",
      ],
    );
    const bucket = (await admin("select * from storage.buckets"))[0];
    assert.equal(bucket.id, "listing-images");
    assert.equal(bucket.public, true);
    assert.equal(Number(bucket.file_size_limit), 2097152);
  } finally {
    await db.close();
  }
});

test("reservation expiry: at least 48 hours and after the pickup day", async () => {
  const { db, query, as, listing } = await setup();
  try {
    const id = await listing();
    await as(buyer);
    await query("select reserve_item($1,'Tomorrow')", [id]);
    const row = (
      await query(
        "select expires_at, pickup_date, created_at from reservations where listing_id=$1",
        [id],
      )
    )[0];
    const hours = (row.expires_at - row.created_at) / 3600000;
    assert.ok(hours >= 47.9, `expires after ${hours}h`);
  } finally {
    await db.close();
  }
});

test("buyer or seller can cancel; others cannot; item becomes available and re-reservable", async () => {
  const { db, query, as, admin, listing } = await setup();
  try {
    const id = await listing();
    await as(buyer);
    await query("select reserve_item($1,'Today')", [id]);
    assert.equal((await query("select * from my_pickup_codes()")).length, 1);

    await as(other);
    await assert.rejects(
      query("select cancel_reservation($1)", [id]),
      /Only the buyer or seller/,
    );
    await as(null);
    await assert.rejects(
      query("select cancel_reservation($1)", [id]),
      /permission denied/,
    );

    await as(seller);
    await query("select cancel_reservation($1)", [id]);
    const [cancelled] = await query(
      "select status, cancelled_at, cancelled_by from reservations where listing_id=$1",
      [id],
    );
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelled_at);
    assert.equal(cancelled.cancelled_by, seller);
    assert.equal(
      (await query("select status from listings where id=$1", [id]))[0].status,
      "AVAILABLE",
    );
    assert.equal(
      (await admin("select * from kostcycle_private.pickup_secrets")).length,
      0,
    );
    await as(seller);
    await assert.rejects(
      query("select cancel_reservation($1)", [id]),
      /no active reservation/,
    );

    // The cancelled reservation stays as history; a new one can be made.
    await as(other);
    await query("select reserve_item($1,'Tomorrow')", [id]);
    assert.equal(
      (await admin("select count(*)::int as n from reservations"))[0].n,
      2,
    );
    await as(buyer);
    assert.equal((await query("select * from my_pickup_codes()")).length, 0);
    // Direct status writes are still impossible.
    await assert.rejects(
      query("update reservations set status='CANCELLED'"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("overdue reservations expire via the RPC and inside reserve_item", async () => {
  const { db, query, as, admin, listing } = await setup();
  try {
    const first = await listing("Lamp");
    const second = await listing("Chair");
    await as(buyer);
    await query("select reserve_item($1,'Today')", [first]);
    await query("select reserve_item($1,'Today')", [second]);
    await as(null);
    assert.equal(
      (await query("select expire_overdue_reservations() as n"))[0].n,
      0,
    );
    await admin(
      "update reservations set expires_at = now() - interval '1 minute' where listing_id=$1",
      [first],
    );
    await as(null);
    assert.equal(
      (await query("select expire_overdue_reservations() as n"))[0].n,
      1,
    );
    const rows = await admin(
      "select listing_id, status, cancelled_at, cancelled_by from reservations order by created_at",
    );
    const expired = rows.find((r) => r.listing_id === first);
    assert.equal(expired.status, "EXPIRED");
    assert.ok(expired.cancelled_at);
    assert.equal(expired.cancelled_by, null);
    assert.equal(rows.find((r) => r.listing_id === second).status, "RESERVED");
    assert.equal(
      (await admin("select status from listings where id=$1", [first]))[0]
        .status,
      "AVAILABLE",
    );

    // reserve_item clears overdue pickups itself (no cron needed).
    await admin(
      "update reservations set expires_at = now() - interval '1 minute' where listing_id=$1 and status='RESERVED'",
      [second],
    );
    await as(other);
    await query("select reserve_item($1,'Today')", [second]);
    const live = await admin(
      "select buyer_id, status from reservations where listing_id=$1 order by created_at",
      [second],
    );
    assert.deepEqual(
      live.map((r) => r.status),
      ["EXPIRED", "RESERVED"],
    );
    assert.equal(live[1].buyer_id, other);
  } finally {
    await db.close();
  }
});

test("completed handoffs still work and cannot be cancelled", async () => {
  const { db, query, as, listing } = await setup();
  try {
    const id = await listing();
    await as(buyer);
    await query("select reserve_item($1,'Today')", [id]);
    const code = (await query("select code from my_pickup_codes()"))[0].code;
    await as(seller);
    assert.equal(
      (await query("select confirm_handoff($1,$2) as r", [id, code]))[0].r.ok,
      true,
    );
    await assert.rejects(
      query("select cancel_reservation($1)", [id]),
      /no active reservation/,
    );
  } finally {
    await db.close();
  }
});

test("chat: only the two participants can read and write, sender is server-set", async () => {
  const { db, query, as, admin, listing } = await setup();
  try {
    const id = await listing();
    await as(buyer);
    const reservation = (
      await query("select reserve_item($1,'Today') as id", [id])
    )[0].id;
    await query(
      "insert into reservation_messages(reservation_id, body) values($1,'Hi! Is 5pm ok?')",
      [reservation],
    );
    await as(seller);
    await query(
      "insert into reservation_messages(reservation_id, body) values($1,'See you at the lobby')",
      [reservation],
    );
    const thread = await query(
      "select sender_id, body from reservation_messages order by created_at",
    );
    assert.deepEqual(
      thread.map((m) => m.sender_id),
      [buyer, seller],
    );
    // Cannot forge the sender or post empty / oversized messages.
    await assert.rejects(
      query(
        "insert into reservation_messages(reservation_id, sender_id, body) values($1,$2,'fake')",
        [reservation, buyer],
      ),
      /permission denied/,
    );
    await assert.rejects(
      query(
        "insert into reservation_messages(reservation_id, body) values($1,'   ')",
        [reservation],
      ),
      /check constraint/,
    );
    await assert.rejects(
      query(
        "insert into reservation_messages(reservation_id, body) values($1,$2)",
        [reservation, "x".repeat(1001)],
      ),
      /check constraint/,
    );
    // Outsiders and anonymous visitors see nothing and cannot post.
    await as(other);
    assert.equal((await query("select * from reservation_messages")).length, 0);
    await assert.rejects(
      query(
        "insert into reservation_messages(reservation_id, body) values($1,'hello')",
        [reservation],
      ),
      /row-level security/,
    );
    await as(null);
    await assert.rejects(
      query("select * from reservation_messages"),
      /permission denied/,
    );
    // After the reservation ends the thread stays open for 7 days, then closes.
    await as(buyer);
    await query("select cancel_reservation($1)", [id]);
    assert.equal((await query("select * from reservation_messages")).length, 2);
    await query(
      "insert into reservation_messages(reservation_id, body) values($1,'No worries')",
      [reservation],
    );
    await admin(
      "update reservations set cancelled_at = now() - interval '8 days' where id=$1",
      [reservation],
    );
    await as(buyer);
    assert.equal((await query("select * from reservation_messages")).length, 0);
    await assert.rejects(
      query(
        "insert into reservation_messages(reservation_id, body) values($1,'late')",
        [reservation],
      ),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test("listing images: storage folder per user, image_url bound to the seller", async () => {
  const { db, query, as, listing } = await setup();
  try {
    await as(seller);
    await query(
      "insert into storage.objects(bucket_id,name) values('listing-images',$1)",
      [`${seller}/fan.webp`],
    );
    await assert.rejects(
      query(
        "insert into storage.objects(bucket_id,name) values('listing-images',$1)",
        [`${buyer}/fan.webp`],
      ),
      /row-level security/,
    );
    await as(null);
    await assert.rejects(
      query(
        "insert into storage.objects(bucket_id,name) values('listing-images',$1)",
        [`${seller}/x.webp`],
      ),
      /permission denied/,
    );
    assert.equal(
      (await query("select * from storage.objects")).length,
      1,
      "anyone can read the public bucket",
    );
    const id = await listing();
    const good = `https://abcdefgh.supabase.co/storage/v1/object/public/listing-images/${seller}/fan.webp`;
    await as(seller);
    await query("update listings set image_url=$1 where id=$2", [good, id]);
    await assert.rejects(
      query("update listings set image_url=$1 where id=$2", [
        `https://abcdefgh.supabase.co/storage/v1/object/public/listing-images/${buyer}/fan.webp`,
        id,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      query("update listings set image_url=$1 where id=$2", [
        "https://evil.example.com/tracker.png",
        id,
      ]),
      /check constraint/,
    );
  } finally {
    await db.close();
  }
});

test("saved interests are private to their owner", async () => {
  const { db, query, as } = await setup();
  try {
    await as(buyer);
    await query(
      `insert into profile_preferences(interests) values('{"interests":["cooling"],"specific":"desk fan","budget":"any","skipped":false}')`,
    );
    await query(
      `update profile_preferences set interests='{"interests":["study"],"specific":"","budget":"free","skipped":false}'`,
    );
    const mine = await query(
      "select user_id, interests from profile_preferences",
    );
    assert.equal(mine.length, 1);
    assert.equal(mine[0].user_id, buyer);
    assert.deepEqual(mine[0].interests.interests, ["study"]);
    await assert.rejects(
      query(
        `insert into profile_preferences(user_id, interests) values($1,'{}')`,
        [seller],
      ),
      /row-level security/,
    );
    await assert.rejects(
      query(`insert into profile_preferences(interests) values('[1,2]')`),
      /check constraint|duplicate key/,
    );
    await as(seller);
    assert.equal((await query("select * from profile_preferences")).length, 0);
    await as(null);
    await assert.rejects(
      query("select * from profile_preferences"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
