// Node-only CLI. Never import this file into frontend code.
import process from "node:process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { backupData, BackupError } from "./lib/backup-data.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backupRoot = resolve(repositoryRoot, "..", "KostCycle-backups");

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "Run npm run backup:data to export the four public tables using .env.seed.local. Only GET requests are sent. Each run creates a new timestamped folder in the sibling KostCycle-backups directory.",
    );
    return;
  }
  if (process.argv.length > 2)
    throw new BackupError(
      "Unknown argument. Use npm run backup:data, or append -- --help.",
    );
  let values;
  try {
    values = parseEnv(
      await readFile(resolve(repositoryRoot, ".env.seed.local"), "utf8"),
    );
  } catch {
    throw new BackupError(
      "Could not load .env.seed.local. The existing local seed credentials file is required.",
    );
  }
  const result = await backupData({
    projectUrl: values.SUPABASE_URL,
    key: values.SUPABASE_SERVICE_ROLE_KEY,
    repositoryRoot,
    backupRoot,
  });
  console.log(`Backup complete: ${result.directory}`);
  for (const [table, info] of Object.entries(result.tables))
    console.log(`${table}: ${info.rows} rows`);
  console.log(
    "Four JSON data files and a SHA-256 manifest verified. No database writes were made. This is not a transactional database or Auth backup.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof BackupError
      ? error.message
      : "Backup failed; no database writes were made. Check the local configuration, network and folder permissions.",
  );
  if (error instanceof BackupError && error.directory)
    console.error(`Incomplete export retained at: ${error.directory}`);
  process.exitCode = 1;
});
