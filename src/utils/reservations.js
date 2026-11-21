// Pure reservation helpers (no Supabase calls). Statuses match the database:
// RESERVED → COMPLETED, or RESERVED → CANCELLED / EXPIRED.
export const ENDED = ["CANCELLED", "EXPIRED"];

export const isLive = (r) =>
  r?.status === "RESERVED" || r?.status === "COMPLETED";

/**
 * A listing can have several reservations over time (cancelled ones stay as
 * history). Pick the one that matters: the active pickup, else the completed
 * one, else the most recent. Optionally only rows this user takes part in.
 */
export function currentReservation(rows, listingId, userId) {
  const mine = (rows || []).filter(
    (r) =>
      r.listingId === listingId &&
      (!userId || r.buyerId === userId || r.sellerId === userId),
  );
  return (
    mine.find((r) => r.status === "RESERVED") ||
    mine.find((r) => r.status === "COMPLETED") ||
    [...mine].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    )[0] ||
    null
  );
}

export function canCancel(reservation, userId) {
  return (
    !!reservation &&
    !!userId &&
    reservation.status === "RESERVED" &&
    (reservation.buyerId === userId || reservation.sellerId === userId)
  );
}

/** Human time left before an unconfirmed pickup is released. */
export function timeLeft(expiresAt, now = Date.now()) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return { expired: false, ms: Infinity, text: "" };
  const ms = end - now;
  if (ms <= 0) return { expired: true, ms: 0, text: "Hold has ended" };
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const text =
    days > 0
      ? `${days}d ${hours}h left`
      : hours > 0
        ? `${hours}h ${mins}m left`
        : `${Math.max(1, mins)}m left`;
  return { expired: false, ms, text, urgent: ms < 3 * 3600000 };
}

export function endedLabel(reservation, userId) {
  if (reservation?.status === "EXPIRED")
    return "This hold expired before the handoff was confirmed. The item is available again.";
  if (reservation?.status === "CANCELLED")
    return reservation.cancelled_by && reservation.cancelled_by === userId
      ? "You cancelled this reservation. The item is available again."
      : "This reservation was cancelled. The item is available again.";
  return "";
}
