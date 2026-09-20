import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X, MapPin } from "lucide-react";
import { useApp } from "../context/store";
import { categories } from "../data/catalog";
import { filterListings } from "../utils/marketplace";
import { ProductGrid } from "../components/UI";

export default function Browse() {
  const { state } = useApp();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(
    () => window.matchMedia("(min-width: 581px)").matches,
  );
  const filters = Object.fromEntries(params);
  const items = filterListings(state.listings, {
    ...filters,
    saved: filters.saved ? state.saved : "",
  });
  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  function radioGroup(key, label, options) {
    return (
      <fieldset>
        <legend>{label}</legend>
        {[["", "All"], ...options].map(([value, text]) => (
          <label className="radio-label" key={value}>
            <input
              type="radio"
              name={key}
              checked={(filters[key] || "") === value}
              onChange={() => update(key, value)}
            />
            {text}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow muted">THE NEIGHBOURHOOD MARKETPLACE</span>
        <h1>
          {filters.saved ? "Your saved finds" : "Find your next good thing."}
        </h1>
        <p>
          <MapPin size={16} />{" "}
          {state.currentUser?.campus || "BINUS Alam Sutera"}{" "}
          <span className="small">
            Distances are illustrative residence estimates, not GPS distances.
          </span>
        </p>
      </div>
      <div className="browse-layout">
        <aside className="filters">
          <details
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>
              <SlidersHorizontal size={18} /> Filters
            </summary>
            <div className="filter-content">
              <button
                className="text-link clear-filters"
                onClick={() => setParams({})}
              >
                Clear all filters
              </button>
              {radioGroup(
                "category",
                "Category",
                categories.map((c) => [c, c]),
              )}
              {radioGroup("distance", "Walking distance", [
                ["250", "Under 250 m"],
                ["500", "Under 500 m"],
                ["1000", "Under 1 km"],
              ])}
              {radioGroup(
                "condition",
                "Condition",
                ["Like New", "Good", "Fair"].map((c) => [c, c]),
              )}
              {radioGroup("price", "Price", [
                ["free", "Free to take"],
                ["under50", "Under Rp50,000"],
                ["50to100", "Rp50,000–Rp100,000"],
                ["above100", "Above Rp100,000"],
              ])}
              <fieldset>
                <legend>Availability</legend>
                <label className="radio-label">
                  <input
                    type="checkbox"
                    checked={!!filters.available}
                    onChange={(e) =>
                      update("available", e.target.checked ? "1" : "")
                    }
                  />
                  Available only
                </label>
              </fieldset>
            </div>
          </details>
        </aside>
        <section className="browse-results">
          <div className="browse-search">
            <Search size={19} />
            <input
              aria-label="Search items"
              placeholder="What are you looking for?"
              value={filters.q || ""}
              onChange={(e) => update("q", e.target.value)}
            />
            {filters.q && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => update("q", "")}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="results-toolbar">
            <span>
              <strong>{items.length}</strong>{" "}
              {items.length === 1 ? "find" : "finds"} nearby
            </span>
            <label>
              Sort by{" "}
              <select
                aria-label="Sort listings"
                value={filters.sort || "nearest"}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="nearest">Nearest first</option>
                <option value="newest">Newest</option>
                <option value="price">Lowest price</option>
              </select>
            </label>
          </div>
          {filters.category && (
            <button
              className="filter-chip"
              onClick={() => update("category", "")}
            >
              {filters.category}
              <X size={13} />
            </button>
          )}
          <ProductGrid items={items} />
        </section>
      </div>
    </div>
  );
}
