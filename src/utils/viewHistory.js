import { categories } from "../data/catalog.js";
const key = (id) => `kostcycle-views-v1:${id || "guest"}`;
// Only a bounded preference history is local. Marketplace records remain in Supabase.
export function readViews(id, storage) {
  try {
    const rows = JSON.parse(
      (storage ?? window.localStorage).getItem(key(id)) || "[]",
    );
    return Array.isArray(rows)
      ? rows
          .filter(
            (row) =>
              typeof row?.id === "string" && categories.includes(row.category),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function addView(history, item) {
  return [
    { id: item.id, category: item.category },
    ...history.filter((row) => row.id !== item.id),
  ].slice(0, 20);
}
export function saveViews(id, rows, storage) {
  try {
    (storage ?? window.localStorage).setItem(key(id), JSON.stringify(rows));
  } catch {
    /* Private mode may disallow preference storage. */
  }
}
