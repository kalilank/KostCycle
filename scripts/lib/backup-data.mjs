// Node-only export engine. Requests are limited to GET on these four public tables.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const tables = [
  { name: "profiles", keys: ["id"] },
  { name: "listings", keys: ["id"] },
  { name: "reservations", keys: ["id"] },
  { name: "saved_items", keys: ["user_id", "listing_id"] },
];

export class BackupError extends Error {}

export function validateCredentials(projectUrl, key) {
  let url;
  try {
    url = new URL(projectUrl);
  } catch {
    throw new BackupError("Invalid SUPABASE_URL in .env.seed.local.");
  }
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new BackupError(
      "Expected a hosted HTTPS Supabase project URL in .env.seed.local.",
    );
  let serviceRole = false;
  try {
    const payload = JSON.parse(
      Buffer.from(String(key).split(".")[1], "base64url").toString("utf8"),
    );
    serviceRole = payload.role === "service_role";
  } catch {
    /* Modern secret keys are not JWTs. */
  }
  if (typeof key !== "string" || (!serviceRole && !/^sb_secret_\S+$/.test(key)))
    throw new BackupError(
      "A server/service-role key is required in .env.seed.local; an anon or publishable key could produce an incomplete export.",
    );
  return url.origin;
}

function inside(parent, target) {
  const path = relative(parent, target);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function rangeInfo(response, table) {
  const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(
    response.headers.get("content-range") || "",
  );
  if (!match || !Number.isSafeInteger(Number(match[3])))
    throw new BackupError(
      `Missing or invalid exact row count for ${table}; export stopped.`,
    );
  return {
    start: match[1] === undefined ? null : Number(match[1]),
    end: match[2] === undefined ? null : Number(match[2]),
    total: Number(match[3]),
  };
}

async function getPage(origin, key, table, offset, limit, fetchImpl) {
  const url = new URL(`/rest/v1/${table.name}`, origin);
  url.searchParams.set("select", limit === 0 ? table.keys.join(",") : "*");
  url.searchParams.set(
    "order",
    table.keys.map((field) => `${field}.asc`).join(","),
  );
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Accept-Profile": "public",
          Prefer: "count=exact",
        },
      });
    } catch {
      if (attempt === 2)
        throw new BackupError(
          `Read request failed for ${table.name}; check connectivity and credentials.`,
        );
    }
    if (response?.ok) {
      let raw;
      try {
        raw = (await response.text()).trim();
      } catch {
        throw new BackupError(
          `Could not read the complete response for ${table.name}.`,
        );
      }
      let rows;
      try {
        rows = JSON.parse(raw);
      } catch {
        throw new BackupError(
          `Invalid JSON response for ${table.name}; no response contents were logged.`,
        );
      }
      if (!Array.isArray(rows) || !raw.startsWith("[") || !raw.endsWith("]"))
        throw new BackupError(`Expected a JSON row array for ${table.name}.`);
      return { raw, rows, ...rangeInfo(response, table.name) };
    }
    if (response) {
      const status = response.status;
      await response.body?.cancel();
      if (![429, 500, 502, 503, 504].includes(status) || attempt === 2)
        throw new BackupError(
          `Read access failed for ${table.name} (HTTP ${status}); no response contents were logged.`,
        );
    }
    await new Promise((done) => setTimeout(done, 500 * (attempt + 1)));
  }
  throw new BackupError(`Could not export ${table.name}.`);
}

async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function exportTable(origin, key, table, directory, fetchImpl) {
  const path = join(directory, `${table.name}.json.partial`);
  const output = await open(path, "wx", 0o600);
  const hash = createHash("sha256");
  const seen = new Set();
  let offset = 0;
  let expected;
  const write = async (text) => {
    await output.writeFile(text, "utf8");
    hash.update(text, "utf8");
  };
  try {
    await write("[\n");
    do {
      const page = await getPage(origin, key, table, offset, 50, fetchImpl);
      if (expected === undefined) expected = page.total;
      if (page.total !== expected)
        throw new BackupError(
          `Row count changed while exporting ${table.name}; retry when writes are paused.`,
        );
      if (page.rows.length) {
        if (page.start !== offset || page.end !== offset + page.rows.length - 1)
          throw new BackupError(
            `Unexpected page range for ${table.name}; export stopped.`,
          );
        for (const row of page.rows) {
          if (
            !row ||
            table.keys.some((field) => typeof row[field] !== "string")
          )
            throw new BackupError(
              `Missing primary key in ${table.name}; export stopped.`,
            );
          const id = JSON.stringify(table.keys.map((field) => row[field]));
          if (seen.has(id))
            throw new BackupError(
              `Duplicate page records detected for ${table.name}; export stopped.`,
            );
          seen.add(id);
        }
        // Never stringify parsed rows: retain nulls, literal "null", exact numeric
        // tokens, timestamp precision, arrays, images and any additional columns.
        await write(`${offset ? ",\n" : ""}${page.raw.slice(1, -1)}`);
        offset += page.rows.length; // Respect server caps smaller than our request.
      } else if (offset !== expected) {
        throw new BackupError(
          `An early empty page was returned for ${table.name}; export stopped.`,
        );
      }
      if (offset > expected)
        throw new BackupError(
          `Row count mismatch for ${table.name}; export stopped.`,
        );
    } while (offset < expected);
    await write("\n]\n");
    await output.sync();
  } finally {
    await output.close();
  }
  const digest = hash.digest("hex");
  if ((await fileHash(path)) !== digest)
    throw new BackupError(`File verification failed for ${table.name}.`);
  return { rows: offset, bytes: (await stat(path)).size, sha256: digest };
}

export async function backupData({
  projectUrl,
  key,
  repositoryRoot,
  backupRoot,
  fetchImpl = fetch,
}) {
  const origin = validateCredentials(projectUrl, key);
  const repository = await realpath(repositoryRoot);
  const target = resolve(backupRoot);
  if (inside(repository, target))
    throw new BackupError("Backups must be outside the repository.");
  await mkdir(target, { recursive: true, mode: 0o700 });
  const canonicalTarget = await realpath(target);
  if (inside(repository, canonicalTarget))
    throw new BackupError(
      "Backup directory resolves inside the repository; export refused.",
    );
  const startedAt = new Date().toISOString();
  const directory = await mkdtemp(
    join(canonicalTarget, `${startedAt.replace(/[:.]/g, "-")}-`),
  );
  try {
    const exports = {};
    for (const table of tables)
      exports[table.name] = await exportTable(
        origin,
        key,
        table,
        directory,
        fetchImpl,
      );
    for (const table of tables) {
      const final = await getPage(origin, key, table, 0, 0, fetchImpl);
      if (final.total !== exports[table.name].rows)
        throw new BackupError(
          `Final row count changed for ${table.name}; retry when writes are paused.`,
        );
    }
    for (const table of tables)
      await rename(
        join(directory, `${table.name}.json.partial`),
        join(directory, `${table.name}.json`),
      );
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(
        {
          status: "complete",
          startedAt,
          completedAt: new Date().toISOString(),
          scope:
            "Data only: public.profiles, public.listings, public.reservations, public.saved_items",
          transactionalSnapshot: false,
          consistency:
            "Sequential GET requests; exact counts verified. Concurrent edits with unchanged row counts cannot be detected. Pause writes for a consistent export.",
          tables: exports,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    return { directory, tables: exports };
  } catch (error) {
    const safe =
      error instanceof BackupError
        ? error
        : new BackupError(
            "Backup could not be written or verified; check disk space, network and folder permissions.",
            { cause: error },
          );
    await writeFile(
      join(directory, "FAILED.json"),
      JSON.stringify({ status: "incomplete", message: safe.message }, null, 2) +
        "\n",
      { flag: "wx", mode: 0o600 },
    ).catch(() => {});
    safe.directory = directory;
    throw safe;
  }
}
