import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  backupData,
  validateCredentials,
} from "../scripts/lib/backup-data.mjs";

const projectUrl = "https://backup-test.supabase.co";
const key = "sb_secret_fake_backup_test_key";
const data = {
  profiles: [
    '{"id":"p1","name":"null","nullable":null,"empty":"","flags":[false,0,null],"created_at":"2026-10-25T01:02:03.123456+00:00"}',
    '{"id":"p2","name":"Alya — 東京"}',
    '{"id":"p3"}',
    '{"id":"p4"}',
    '{"id":"p5"}',
  ],
  listings: [
    '{"id":"l1","price":9007199254740993,"weight":1.20000000000000000001,"image_data":"data:image/png;base64,AAA=","archived_at":null}',
    '{"id":"l2","additional_field":{"enabled":true}}',
    '{"id":"l3"}',
  ],
  reservations: [
    '{"id":"r1","completed_at":null}',
    '{"id":"r2","completed_at":"2026-10-25T01:02:03.999999Z"}',
  ],
  saved_items: [
    '{"user_id":"p1","listing_id":"l1"}',
    '{"user_id":"p1","listing_id":"l2"}',
    '{"user_id":"p2","listing_id":"l1"}',
  ],
};

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), "kostcycle-backup-tests-"));
  const repositoryRoot = join(root, "repo");
  const backupRoot = join(root, "backups");
  await mkdir(repositoryRoot);
  t.after(async () => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^kostcycle-backup-tests-/);
    await rm(root, { recursive: true, force: true });
  });
  return { projectUrl, key, repositoryRoot, backupRoot };
}

function api({ rows = data, mutate } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Prefer, "count=exact");
    assert.equal(options.headers["Accept-Profile"], "public");
    assert.equal(options.headers.apikey, key);
    assert.equal(url.origin, projectUrl);
    assert.ok(!url.href.includes(key));
    const table = url.pathname.split("/").at(-1);
    assert.ok(Object.hasOwn(rows, table));
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    calls.push({ table, offset, limit, order: url.searchParams.get("order") });
    // Simulate a server row cap LOWER than the client's requested page size.
    const page =
      limit === 0 ? [] : rows[table].slice(offset, offset + Math.min(limit, 2));
    const result = {
      body: `[${page.join(",")}]`,
      total: rows[table].length,
      start: offset,
      size: page.length,
    };
    mutate?.(result, { table, offset, limit });
    return new Response(result.body, {
      headers: {
        "content-type": "application/json",
        "content-range": `${result.size ? `${result.start}-${result.start + result.size - 1}` : "*"}/${result.total}`,
      },
    });
  };
  return { calls, fetchImpl };
}

test("backup exports every page with raw numeric/null/string/timestamp values and verifies checksums", async (t) => {
  const options = await sandbox(t);
  const mock = api();
  const result = await backupData({
    ...options,
    fetchImpl: mock.fetchImpl,
  }).catch((error) => {
    if (error.cause)
      throw new Error(
        `${error.cause.name}/${error.cause.code || "no-code"} ${String(error.cause.stack).split("\n")[1]}`,
        { cause: error },
      );
    throw error;
  });
  const manifest = JSON.parse(
    await readFile(join(result.directory, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.transactionalSnapshot, false);
  assert.equal(JSON.stringify(manifest).includes(key), false);
  for (const table of Object.keys(data)) {
    const bytes = await readFile(join(result.directory, `${table}.json`));
    const rows = JSON.parse(bytes);
    assert.equal(rows.length, data[table].length);
    assert.equal(manifest.tables[table].rows, rows.length);
    assert.equal(manifest.tables[table].bytes, bytes.length);
    assert.equal(
      manifest.tables[table].sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    for (const row of data[table])
      assert.ok(bytes.toString("utf8").includes(row));
  }
  const profiles = JSON.parse(
    await readFile(join(result.directory, "profiles.json"), "utf8"),
  );
  assert.equal(profiles[0].name, "null");
  assert.equal(profiles[0].nullable, null);
  assert.equal(profiles[0].empty, "");
  assert.deepEqual(profiles[0].flags, [false, 0, null]);
  assert.deepEqual(
    mock.calls
      .filter((c) => c.table === "profiles" && c.limit)
      .map((c) => c.offset),
    [0, 2, 4],
  );
  assert.ok(
    mock.calls
      .filter((c) => c.table === "saved_items")
      .every((c) => c.order === "user_id.asc,listing_id.asc"),
  );
  assert.equal(
    (await readdir(result.directory)).some((file) => file.endsWith(".partial")),
    false,
  );
});

test("rerunning creates a separate backup without overwriting previous files", async (t) => {
  const options = await sandbox(t);
  const first = await backupData({ ...options, fetchImpl: api().fetchImpl });
  const original = await readFile(
    join(first.directory, "profiles.json"),
    "utf8",
  );
  const second = await backupData({ ...options, fetchImpl: api().fetchImpl });
  assert.notEqual(first.directory, second.directory);
  assert.equal(
    await readFile(join(first.directory, "profiles.json"), "utf8"),
    original,
  );
});

test("changed totals and duplicate pages fail safely without a completed manifest", async (t) => {
  for (const duplicate of [false, true]) {
    const options = await sandbox(t);
    const mock = api({
      mutate(result, request) {
        if (request.table === "profiles" && request.offset === 2) {
          if (duplicate)
            result.body = `[${data.profiles.slice(0, 2).join(",")}]`;
          else result.total++;
        }
      },
    });
    await assert.rejects(
      backupData({ ...options, fetchImpl: mock.fetchImpl }),
      /changed|Duplicate/,
    );
    const [folder] = await readdir(options.backupRoot);
    const files = await readdir(join(options.backupRoot, folder));
    assert.ok(files.includes("FAILED.json"));
    assert.ok(!files.includes("manifest.json"));
    assert.ok(!files.includes("profiles.json"));
  }
});

test("a final count change prevents successful completion", async (t) => {
  const options = await sandbox(t);
  const mock = api({
    mutate(result, request) {
      if (request.limit === 0 && request.table === "profiles") result.total++;
    },
  });
  await assert.rejects(
    backupData({ ...options, fetchImpl: mock.fetchImpl }),
    /Final row count changed/,
  );
});

test("empty tables are backed up as empty arrays", async (t) => {
  const options = await sandbox(t);
  const rows = Object.fromEntries(
    Object.keys(data).map((table) => [table, []]),
  );
  const result = await backupData({
    ...options,
    fetchImpl: api({ rows }).fetchImpl,
  });
  for (const table of Object.keys(rows))
    assert.deepEqual(
      JSON.parse(
        await readFile(join(result.directory, `${table}.json`), "utf8"),
      ),
      [],
    );
});

test("anon keys and output paths inside the repository are rejected before any requests", async (t) => {
  const options = await sandbox(t);
  let calls = 0;
  const fetchImpl = () => {
    calls++;
    throw Error("must not send a request");
  };
  assert.throws(
    () => validateCredentials(projectUrl, "sb_publishable_test"),
    /server\/service-role key/,
  );
  await assert.rejects(
    backupData({ ...options, key: "invalid", fetchImpl }),
    /server\/service-role key/,
  );
  await assert.rejects(
    backupData({
      ...options,
      backupRoot: join(options.repositoryRoot, "backups"),
      fetchImpl,
    }),
    /outside the repository/,
  );
  assert.equal(calls, 0);
});

test("HTTP errors never include credentials or response data in diagnostic messages", async (t) => {
  const options = await sandbox(t);
  const fetchImpl = async (_url, request) => {
    assert.equal(request.method, "GET");
    return new Response(`Sensitive row contents and ${key}`, { status: 403 });
  };
  await assert.rejects(backupData({ ...options, fetchImpl }), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.equal(error.message.includes(key), false);
    assert.equal(error.message.includes("Sensitive row"), false);
    return true;
  });
});
