import { useApp } from "../context/store";
import { categoryAffinity, recommendItems } from "../utils/recommendations";
import { ProductGrid } from "./UI";
export default function Recommendations({ current }) {
  const { state, viewHistory } = useApp();
  const affinity = categoryAffinity(
    viewHistory,
    state.reservations.filter((r) => r.buyerId === state.currentUser?.id),
    state.listings,
  );
  const items = recommendItems(state.listings, {
    current,
    user: state.currentUser,
    affinity,
  });
  if (!items.length) return null;
  return (
    <section className="recommendations">
      <div className="section-heading">
        <div>
          <h2>{current ? "Similar items" : "Recommended for you"}</h2>
          <p className="small muted">
            {affinity.length || current
              ? "Based on categories, residence and price."
              : "Available finds, nearby first."}
          </p>
        </div>
      </div>
      <ProductGrid items={items} />
    </section>
  );
}
