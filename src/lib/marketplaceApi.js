import { supabase } from "./supabase";
import { estimatedDistance } from "../data/catalog";

export const emptyState = () => ({
  currentUser: null,
  profiles: [],
  listings: [],
  reservations: [],
  transactions: [],
  saved: [],
  messageMeta: [],
  preferences: null,
});
// The 30 s reconcile never downloads photo bytes: listings carry a Storage URL
// (image_url), and legacy base64 photos are fetched once and cached below.
export const LISTING_COLUMNS =
  "id,seller_id,name,category,condition,price,is_free,university,campus,residence,distance,pickup,description,image_index,image_url,status,estimated_weight,created_at,updated_at,is_demo,seed_key,archived_at,archived_by";
const legacyImages = new Map(); // `${id}:${updated_at}` → data URL
export const mapProfile = (row) => ({ ...row });
export const mapListing = (row, legacyImage) => ({
  ...row,
  sellerId: row.seller_id,
  imageIndex: row.image_index,
  image: row.image_url || row.image_data || legacyImage?.(row) || null,
  price: Number(row.price),
  estimatedWeight: Number(row.estimated_weight),
  createdAt: row.created_at,
});
export const mapReservation = (row, codes = []) => ({
  ...row,
  listingId: row.listing_id,
  buyerId: row.buyer_id,
  sellerId: row.seller_id,
  location: row.pickup_location,
  period: row.pickup_period,
  pickupDate: row.pickup_date,
  createdAt: row.created_at,
  completedAt: row.completed_at,
  weight: Number(row.estimated_weight),
  expiresAt: row.expires_at,
  cancelledAt: row.cancelled_at,
  code: codes.find((code) => code.listing_id === row.listing_id)?.code,
});
export function readableError(error) {
  if (
    ["42703", "PGRST204"].includes(error?.code) ||
    error?.message?.includes("moderate_listing")
  )
    return "Database update required: run the pending files in supabase/migrations (see docs/NEW_SUPABASE_PROJECT.md), then Retry.";
  if (["PGRST205", "42P01", "PGRST202", "42883"].includes(error?.code))
    return "Database setup is incomplete. Run the files in supabase/migrations in order (see docs/NEW_SUPABASE_PROJECT.md), then Retry.";
  if (error?.code === "42501")
    return "You do not have permission for this action. Check your account and the database migration.";
  if (error?.code === "23505")
    return "This item was already reserved. Refresh to see its current status.";
  return (
    error?.message ||
    "Could not reach KostCycle. Check your connection and try again."
  );
}
export function check(result) {
  if (result.error) throw result.error;
  return result.data;
}
async function allRows(table, columns = "*", where = (q) => q) {
  const rows = [];
  for (let offset = 0; ; offset += 250) {
    const data = check(
      await where(supabase.from(table).select(columns))
        .order(table === "saved_items" ? "listing_id" : "id")
        .range(offset, offset + 249),
    );
    rows.push(...data);
    if (data.length < 250) return rows;
  }
}
// Old listings stored photos as base64 in image_data. Fetch those bytes only
// for rows we have not cached yet (keyed by updated_at so edits refresh).
async function legacyImageLookup() {
  const withData = await allRows("listings", "id,updated_at", (q) =>
    q.not("image_data", "is", null),
  );
  const missing = withData.filter(
    (row) => !legacyImages.has(`${row.id}:${row.updated_at}`),
  );
  for (let i = 0; i < missing.length; i += 20) {
    const rows = check(
      await supabase
        .from("listings")
        .select("id,updated_at,image_data")
        .in(
          "id",
          missing.slice(i, i + 20).map((row) => row.id),
        ),
    );
    for (const row of rows)
      legacyImages.set(`${row.id}:${row.updated_at}`, row.image_data);
  }
  return (row) => legacyImages.get(`${row.id}:${row.updated_at}`) || null;
}
export async function fetchMarketplace(userId) {
  const [
    listings,
    legacyImage,
    profiles,
    reservations,
    saved,
    codes,
    messageMeta,
    preferences,
  ] = await Promise.all([
    allRows("listings", LISTING_COLUMNS),
    legacyImageLookup(),
    allRows("profiles"),
    userId ? allRows("reservations") : [],
    userId ? allRows("saved_items") : [],
    userId ? supabase.rpc("my_pickup_codes").then(check) : [],
    // Metadata only (no message text) for unread dots; RLS limits it to my threads.
    userId
      ? allRows(
          "reservation_messages",
          "id,reservation_id,sender_id,created_at",
        )
      : [],
    userId
      ? supabase
          .from("profile_preferences")
          .select("interests")
          .maybeSingle()
          .then(check)
      : null,
  ]);
  const mappedReservations = reservations.map((row) =>
    mapReservation(row, codes),
  );
  const currentUser = profiles.find((profile) => profile.id === userId) || null;
  if (userId && !currentUser)
    throw new Error(
      "Your student profile is missing. Apply the KostCycle migration, which backfills existing accounts, then retry.",
    );
  return {
    currentUser,
    profiles: profiles.map(mapProfile),
    listings: listings.map((row) => mapListing(row, legacyImage)),
    reservations: mappedReservations,
    transactions: mappedReservations.filter(
      (row) => row.status === "COMPLETED",
    ),
    saved: saved.map((row) => row.listing_id),
    messageMeta,
    preferences: preferences?.interests ?? null,
  };
}
export function listingPayload(listing) {
  return {
    name: listing.name.trim(),
    category: listing.category,
    condition: listing.condition,
    price: listing.price,
    residence: listing.residence,
    distance: estimatedDistance(listing.residence),
    pickup: listing.pickup,
    description: listing.description.trim(),
    image_index: listing.imageIndex ?? 0,
    // New photos live in Storage; base64 is kept only for older listings.
    image_url: listing.image_url || null,
    image_data:
      !listing.image_url &&
      typeof listing.image === "string" &&
      listing.image.startsWith("data:")
        ? listing.image
        : null,
  };
}
