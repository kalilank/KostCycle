// Optional asset preparation only; no Supabase access or build-time network calls.
import { mkdir, access, writeFile } from "node:fs/promises";
import { productPhotos } from "../src/data/productPhotos.js";
const root = new URL("../public/products/", import.meta.url);
await mkdir(root, { recursive: true });
let downloaded = 0;
for (const photo of productPhotos) {
  const path = new URL(`${photo.key}.jpg`, root);
  try {
    await access(path);
    continue;
  } catch {
    /* Download missing assets only. */
  }
  const response = await fetch(photo.download, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `Pexels download failed for ${photo.key}: HTTP ${response.status}`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.length < 2000)
    throw new Error(`Invalid JPEG for ${photo.key}; no file written.`);
  await writeFile(path, bytes, { flag: "wx" });
  downloaded++;
  console.log(`${photo.key}: ${Math.round(bytes.length / 1024)} KB`);
}
console.log(
  `${downloaded} downloaded; ${productPhotos.length} curated photo paths ready.`,
);
