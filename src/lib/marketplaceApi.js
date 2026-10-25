import { supabase } from "./supabase";
import { estimatedDistance } from "../data/catalog";

export const emptyState = () => ({
  currentUser: null,
  profiles: [],
  listings: [],
  reservations: [],
  transactions: [],
  saved: [],
});
export const mapProfile = (row) => ({ ...row });
export const mapListing = (row) => ({
  ...row,
  sellerId: row.seller_id,
  imageIndex: row.image_index,
  image: row.image_data,
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
  code: codes.find((code) => code.listing_id === row.listing_id)?.code,
});
export function readableError(error) {
  if (
    ["42703", "PGRST204"].includes(error?.code) ||
    error?.message?.includes("moderate_listing")
  )
    return "Database update required: apply 202610120001_feedback_admin_demo.sql, then Retry.";
  if (["PGRST205", "42P01", "PGRST202", "42883"].includes(error?.code))
    return "Database setup is incomplete. Apply only pending migrations listed in SETUP_FEEDBACK.md, then Retry.";
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
async function allRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += 250) {
    const data = check(
      await supabase
        .from(table)
        .select("*")
        .order(table === "saved_items" ? "listing_id" : "id")
        .range(offset, offset + 249),
    );
    rows.push(...data);
    if (data.length < 250) return rows;
  }
}
export async function fetchMarketplace(userId) {
  const [listings, profiles, reservations, saved, codes] = await Promise.all([
    allRows("listings"),
    allRows("profiles"),
    userId ? allRows("reservations") : [],
    userId ? allRows("saved_items") : [],
    userId ? supabase.rpc("my_pickup_codes").then(check) : [],
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
    listings: listings.map(mapListing),
    reservations: mappedReservations,
    transactions: mappedReservations.filter(
      (row) => row.status === "COMPLETED",
    ),
    saved: saved.map((row) => row.listing_id),
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
    image_data: listing.image || null,
  };
}
