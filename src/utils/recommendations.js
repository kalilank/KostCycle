// Deterministic content scoring, not a trained model. No location/GPS inference.
export function categoryAffinity(history, reservations, listings) {
  const viewed = history.slice(0, 20).map((entry) => entry.category);
  const reserved = [...reservations]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 10)
    .map((r) => listings.find((item) => item.id === r.listingId)?.category);
  return [...new Set([...viewed, ...reserved].filter(Boolean))];
}
export function recommendItems(
  listings,
  { current, user, affinity = [], limit = 4 } = {},
) {
  const residence = current?.residence || user?.residence;
  return listings
    .filter(
      (item) =>
        item.id !== current?.id &&
        item.status === "AVAILABLE" &&
        !item.archived_at &&
        item.sellerId !== user?.id,
    )
    .map((item) => {
      let score = 0;
      const reasons = [];
      if (current && item.category === current.category) {
        score += 5;
        reasons.push("Same category");
      }
      if (affinity.includes(item.category)) {
        score += 3;
        reasons.push("Your recent interests");
      }
      if (residence && residence !== "Other" && item.residence === residence) {
        score += 2;
        reasons.push("Same residence");
      }
      if (current && item.condition === current.condition) {
        score += 1;
        reasons.push("Similar condition");
      }
      if (
        current &&
        (current.price === 0
          ? item.price === 0
          : item.price > 0 &&
            Math.abs(item.price - current.price) / current.price <= 0.3)
      ) {
        score += 1;
        reasons.push("Similar price");
      }
      return {
        ...item,
        recommendationScore: score,
        recommendationReason:
          reasons.slice(0, 2).join(" · ") || "Nearby & available",
      };
    })
    .sort(
      (a, b) =>
        b.recommendationScore - a.recommendationScore ||
        (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
        String(b.createdAt).localeCompare(String(a.createdAt)) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
