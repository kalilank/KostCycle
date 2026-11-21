// Pure chat helpers. The database enforces the same rules (RLS + checks).
export const MAX_MESSAGE = 1000;
export const CHAT_GRACE_DAYS = 7;

export function cleanMessage(text) {
  const body = String(text ?? "").trim();
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_MESSAGE)
    return {
      ok: false,
      error: `Keep it under ${MAX_MESSAGE} characters (${body.length} now).`,
    };
  return { ok: true, body };
}

/** Chat stays open while RESERVED and for 7 days after the reservation ends. */
export function chatOpen(reservation, now = Date.now()) {
  if (!reservation) return false;
  if (reservation.status === "RESERVED") return true;
  const ended = reservation.completedAt || reservation.cancelled_at;
  if (!ended) return false;
  return now - new Date(ended).getTime() < CHAT_GRACE_DAYS * 86400000;
}

/** Merge new messages into a thread: no duplicates, oldest first. */
export function mergeMessages(thread, incoming) {
  const byId = new Map((thread || []).map((m) => [m.id, m]));
  for (const m of [].concat(incoming || [])) if (m?.id) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

const readKey = (userId) => `kostcycle-chat-read-v1:${userId || "guest"}`;

/** { [reservationId]: ISO time of the newest message this user has seen } */
export function readLastRead(userId, storage) {
  try {
    const raw = JSON.parse(
      (storage ?? window.localStorage).getItem(readKey(userId)) || "{}",
    );
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([k, v]) => typeof k === "string" && typeof v === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function saveLastRead(userId, map, storage) {
  try {
    (storage ?? window.localStorage).setItem(
      readKey(userId),
      JSON.stringify(map),
    );
  } catch {
    /* Private mode may block storage; unread dots then reset per session. */
  }
}

export function markRead(map, reservationId, at) {
  const prev = map?.[reservationId];
  if (prev && String(prev) >= String(at)) return map;
  return { ...map, [reservationId]: at };
}

/**
 * Reservation ids with a message from the other person newer than what this
 * user has read. `meta` rows: { reservation_id, sender_id, created_at }.
 */
export function unreadReservations(meta, userId, lastRead = {}) {
  const out = new Set();
  if (!userId) return out;
  for (const m of meta || []) {
    if (m.sender_id === userId) continue;
    const seen = lastRead[m.reservation_id];
    if (!seen || String(m.created_at) > String(seen)) out.add(m.reservation_id);
  }
  return out;
}
