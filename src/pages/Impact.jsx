import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Repeat2,
  CheckCircle2,
  Leaf,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../context/store";
import { EmptyState, ProductImage } from "../components/UI";
import BackButton from "../components/BackButton";

export default function Impact() {
  const { state } = useApp();
  const transactions = state.transactions.filter(
    (t) =>
      t.buyerId === state.currentUser.id || t.sellerId === state.currentUser.id,
  );
  const weight = transactions.reduce((total, t) => total + t.weight, 0);
  return (
    <div className="container page impact-page">
      <BackButton fallback="/profile" />
      <div className="page-heading">
        <span className="eyebrow muted">EVERY NEW HOME MAKES A DIFFERENCE</span>
        <h1>
          Your Impact<span className="yellow-dot">.</span>
        </h1>
        <p>Small handoffs, less waste.</p>
      </div>
      <section className="impact-hero">
        <div>
          <span className="eyebrow">STILL USEFUL. STILL IN THE CYCLE.</span>
          <h2>
            Good things
            <br />
            go around.
          </h2>
          <p>
            Every item passed on is one more thing
            <br />
            that gets to keep being useful.
          </p>
        </div>
        <div className="impact-orbit">
          <Repeat2 size={88} strokeWidth={1} />
          <span>PASS IT ON.</span>
        </div>
      </section>
      <section className="impact-stats">
        <div>
          <Repeat2 size={25} />
          <strong>{transactions.length}</strong>
          <h3>Items reused</h3>
          <p>Given another chapter.</p>
        </div>
        <div>
          <CheckCircle2 size={25} />
          <strong>{transactions.length}</strong>
          <h3>Completed handoffs</h3>
          <p>Good things, passed on locally.</p>
        </div>
        <div>
          <Leaf size={25} />
          <strong>
            {weight.toFixed(1)}
            <span>kg</span>
          </strong>
          <h3>Kept in circulation</h3>
          <p>Estimated weight, less waste.</p>
        </div>
      </section>
      <p className="impact-disclaimer">
        Estimated weight based on item category. These are illustrative
        estimates, not measured environmental outcomes. Only completed handoffs
        count.
      </p>
      <section className="impact-history">
        <div className="section-heading">
          <h2>Your cycle so far</h2>
          <span className="muted">
            {transactions.length}{" "}
            {transactions.length === 1 ? "handoff" : "handoffs"}
          </span>
        </div>
        {transactions.length ? (
          transactions.map((t) => {
            const item = state.listings.find((i) => i.id === t.listingId) || {
              name: "Completed item",
              category: "Other Essentials",
            };
            return (
              <Link
                className="impact-row"
                key={t.id}
                to={`/item/${t.listingId}`}
              >
                <ProductImage item={item} />
                <div>
                  <h3>{item.name}</h3>
                  <span>
                    {new Date(t.completedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    ·{" "}
                    {t.buyerId === state.currentUser.id
                      ? "Found a home with you"
                      : "Passed on to a neighbour"}
                  </span>
                </div>
                <strong>{t.weight.toFixed(1)} kg</strong>
                <ArrowUpRight size={20} />
              </Link>
            );
          })
        ) : (
          <EmptyState
            title="Your first handoff is just the beginning."
            text="Complete a pickup and watch your impact grow here."
            action={
              <Link className="button primary" to="/browse">
                Find something nearby <ArrowRight size={17} />
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
