export const currency = (value) =>
  value === 0
    ? "FREE"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value);
export const distanceText = (value) =>
  value < 1000 ? `${value} m` : `${(value / 1000).toFixed(1)} km`;
export const meetup = (item) =>
  item.residence === "Other"
    ? "Residence common area"
    : `${item.residence} lobby`;
export function filterListings(listings, filters) {
  const {
    q = "",
    category = "",
    distance = "",
    condition = "",
    price = "",
    available = "",
    sort = "nearest",
    saved = "",
  } = filters;
  return listings
    .filter((item) => {
      const text =
        `${item.name} ${item.category} ${item.residence} ${item.description}`.toLowerCase();
      return (
        text.includes(q.toLowerCase()) &&
        (!category || item.category === category) &&
        (!distance || item.distance < Number(distance)) &&
        (!condition || item.condition === condition) &&
        (!available || item.status === "AVAILABLE") &&
        (!saved || saved.includes(item.id)) &&
        (!price ||
          (price === "free"
            ? item.price === 0
            : price === "under50"
              ? item.price > 0 && item.price < 50000
              : price === "50to100"
                ? item.price >= 50000 && item.price <= 100000
                : item.price > 100000))
      );
    })
    .sort((a, b) =>
      sort === "newest"
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : sort === "price"
          ? a.price - b.price
          : a.distance - b.distance,
    );
}
