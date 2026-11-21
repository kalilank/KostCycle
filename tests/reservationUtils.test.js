import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentReservation,
  canCancel,
  timeLeft,
  endedLabel,
} from "../src/utils/reservations.js";
import {
  cleanMessage,
  chatOpen,
  mergeMessages,
  readLastRead,
  saveLastRead,
  markRead,
  unreadReservations,
  MAX_MESSAGE,
} from "../src/utils/chat.js";
import {
  fitWithin,
  listingImagePath,
  isListingImageUrl,
  validateSourceImage,
} from "../src/utils/images.js";
import { resolveInterests } from "../src/utils/interests.js";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
  };
};

test("currentReservation prefers the active, then completed, then newest row", () => {
  const rows = [
    {
      id: "old",
      listingId: "L",
      status: "CANCELLED",
      createdAt: "2026-11-01",
      buyerId: U1,
      sellerId: U2,
    },
    {
      id: "exp",
      listingId: "L",
      status: "EXPIRED",
      createdAt: "2026-11-03",
      buyerId: U1,
      sellerId: U2,
    },
    {
      id: "live",
      listingId: "L",
      status: "RESERVED",
      createdAt: "2026-11-02",
      buyerId: "x",
      sellerId: U2,
    },
    {
      id: "other",
      listingId: "M",
      status: "RESERVED",
      createdAt: "2026-11-04",
      buyerId: U1,
      sellerId: U2,
    },
  ];
  assert.equal(currentReservation(rows, "L").id, "live");
  assert.equal(currentReservation(rows, "L", U1).id, "exp");
  assert.equal(currentReservation(rows, "nope"), null);
  assert.equal(
    currentReservation(
      [
        ...rows,
        {
          id: "done",
          listingId: "L",
          status: "COMPLETED",
          createdAt: "2026-10-01",
          buyerId: U1,
          sellerId: U2,
        },
      ],
      "L",
      U1,
    ).id,
    "done",
  );
});

test("only the buyer or seller can cancel an active reservation", () => {
  const r = { status: "RESERVED", buyerId: U1, sellerId: U2 };
  assert.ok(canCancel(r, U1) && canCancel(r, U2));
  assert.ok(!canCancel(r, "someone-else"));
  assert.ok(!canCancel({ ...r, status: "COMPLETED" }, U1));
  assert.ok(!canCancel(null, U1));
});

test("timeLeft formats days, hours and minutes and flags urgency", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  assert.equal(timeLeft("2026-11-23T03:00:00Z", now).text, "2d 3h left");
  const soon = timeLeft("2026-11-21T02:05:00Z", now);
  assert.equal(soon.text, "2h 5m left");
  assert.equal(soon.urgent, true);
  assert.equal(timeLeft("2026-11-21T00:00:20Z", now).text, "1m left");
  assert.deepEqual(timeLeft("2026-11-20T23:00:00Z", now).expired, true);
  assert.equal(timeLeft(undefined, now).text, "");
});

test("ended labels explain cancelled vs expired holds", () => {
  assert.match(endedLabel({ status: "EXPIRED" }), /expired/);
  assert.match(
    endedLabel({ status: "CANCELLED", cancelled_by: U1 }, U1),
    /You cancelled/,
  );
  assert.match(
    endedLabel({ status: "CANCELLED", cancelled_by: U2 }, U1),
    /was cancelled/,
  );
  assert.equal(endedLabel({ status: "RESERVED" }), "");
});

test("cleanMessage trims and enforces 1 to 1000 characters", () => {
  assert.deepEqual(cleanMessage("  hi  "), { ok: true, body: "hi" });
  assert.equal(cleanMessage("   ").ok, false);
  assert.equal(cleanMessage(null).ok, false);
  assert.equal(cleanMessage("x".repeat(MAX_MESSAGE)).ok, true);
  assert.match(cleanMessage("x".repeat(MAX_MESSAGE + 1)).error, /1000/);
});

test("chat stays open while reserved and for 7 days after it ends", () => {
  const now = Date.parse("2026-11-21T00:00:00Z");
  assert.ok(chatOpen({ status: "RESERVED" }, now));
  assert.ok(
    chatOpen({ status: "COMPLETED", completedAt: "2026-11-15T00:00:00Z" }, now),
  );
  assert.ok(
    !chatOpen(
      { status: "COMPLETED", completedAt: "2026-11-13T00:00:00Z" },
      now,
    ),
  );
  assert.ok(
    chatOpen(
      { status: "CANCELLED", cancelled_at: "2026-11-20T00:00:00Z" },
      now,
    ),
  );
  assert.ok(!chatOpen({ status: "EXPIRED" }, now));
  assert.ok(!chatOpen(null, now));
});

test("mergeMessages de-duplicates and keeps oldest first", () => {
  const a = { id: "a", created_at: "2026-11-21T01:00:00Z" };
  const b = { id: "b", created_at: "2026-11-21T02:00:00Z" };
  assert.deepEqual(
    mergeMessages([b], [a, b]).map((m) => m.id),
    ["a", "b"],
  );
  assert.deepEqual(
    mergeMessages(null, a).map((m) => m.id),
    ["a"],
  );
});

test("unread dots: only the other person's newer messages count", () => {
  const meta = [
    { reservation_id: "r1", sender_id: U2, created_at: "2026-11-21T02:00:00Z" },
    { reservation_id: "r1", sender_id: U1, created_at: "2026-11-21T03:00:00Z" },
    { reservation_id: "r2", sender_id: U2, created_at: "2026-11-21T01:00:00Z" },
    { reservation_id: "r3", sender_id: U1, created_at: "2026-11-21T01:00:00Z" },
  ];
  assert.deepEqual([...unreadReservations(meta, U1, {})].sort(), ["r1", "r2"]);
  const read = markRead({}, "r1", "2026-11-21T02:00:00Z");
  assert.deepEqual([...unreadReservations(meta, U1, read)], ["r2"]);
  assert.equal(
    markRead(read, "r1", "2026-11-20T00:00:00Z"),
    read,
    "older marks are ignored",
  );
  assert.equal(unreadReservations(meta, null).size, 0);
});

test("last-read map persists per user and survives bad storage", () => {
  const storage = fakeStorage();
  saveLastRead(U1, { r1: "2026-11-21T02:00:00Z" }, storage);
  assert.deepEqual(readLastRead(U1, storage), { r1: "2026-11-21T02:00:00Z" });
  assert.deepEqual(readLastRead(U2, storage), {});
  assert.deepEqual(
    readLastRead(U1, fakeStorage({ [`kostcycle-chat-read-v1:${U1}`]: "[1]" })),
    {},
  );
  assert.deepEqual(
    readLastRead(
      U1,
      fakeStorage({ [`kostcycle-chat-read-v1:${U1}`]: "{oops" }),
    ),
    {},
  );
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readLastRead(U1, throwing), {});
  assert.doesNotThrow(() => saveLastRead(U1, {}, throwing));
});

test("image sizing keeps aspect ratio and never upscales", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1200, height: 900 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 900, height: 1200 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, 10), { width: 0, height: 0 });
});

test("upload paths live in the user's own folder", () => {
  assert.equal(listingImagePath(U1, "abc-123"), `${U1}/abc-123.webp`);
  assert.equal(
    listingImagePath(U1.toUpperCase(), "a/../b", "jpg"),
    `${U1}/a..b.jpg`,
  );
  assert.throws(() => listingImagePath("not-a-user", "x"), /Sign in/);
  assert.throws(() => listingImagePath(U1, "///"), /name/);
});

test("image URLs must be our bucket and the seller's folder (mirrors the DB check)", () => {
  const ok = `https://abcd1234.supabase.co/storage/v1/object/public/listing-images/${U1}/fan.webp`;
  assert.ok(isListingImageUrl(ok, U1));
  assert.ok(!isListingImageUrl(ok, U2));
  assert.ok(
    isListingImageUrl(
      `http://127.0.0.1:54321/storage/v1/object/public/listing-images/${U1}/x.webp`,
    ),
  );
  assert.ok(!isListingImageUrl("https://evil.example.com/x.png"));
  assert.ok(!isListingImageUrl(ok.replace("listing-images", "other")));
  assert.ok(!isListingImageUrl(null));
});

test("source photo validation", () => {
  assert.equal(validateSourceImage({ type: "image/png", size: 1000 }), "");
  assert.match(validateSourceImage({ type: "image/gif", size: 10 }), /JPG/);
  assert.match(
    validateSourceImage({ type: "image/jpeg", size: 16 * 1024 * 1024 }),
    /15 MB/,
  );
  assert.match(validateSourceImage(null), /Choose/);
});

test("interests: signed-in users use their saved row; device answers migrate once", () => {
  const server = {
    interests: ["study"],
    specific: "",
    budget: "any",
    skipped: false,
  };
  const local = {
    interests: ["cooling"],
    specific: "fan",
    budget: "free",
    skipped: false,
  };
  assert.deepEqual(
    resolveInterests({ signedIn: false, server, local }).value.interests,
    ["cooling"],
  );
  assert.deepEqual(resolveInterests({ signedIn: true, server, local }), {
    value: { ...server },
    migrate: false,
  });
  const fresh = resolveInterests({ signedIn: true, server: null, local });
  assert.equal(fresh.migrate, true);
  assert.deepEqual(fresh.value.interests, ["cooling"]);
  assert.deepEqual(
    resolveInterests({ signedIn: true, server: null, local: null }),
    { value: null, migrate: false },
  );
});
