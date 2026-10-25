import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../context/store";
import { EmptyState, Modal, ProductImage, StatusBadge } from "../components/UI";
import BackButton from "../components/BackButton";
import { currency } from "../utils/marketplace";

export default function Admin() {
  const { state, dispatch, notify, realtimeStatus } = useApp();
  const { id } = useParams();
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Route guard is also present in App. Database policies are the actual authority.
  if (state.currentUser?.role !== "admin")
    return (
      <div className="container page">
        <EmptyState
          title="Admin access required"
          text="Your student account can still buy and sell."
          action={
            <Link to="/" className="button primary">
              Home
            </Link>
          }
        />
      </div>
    );
  const listings = state.listings.filter((i) => !i.is_demo);
  const transactions = state.reservations.filter((r) =>
    listings.some((i) => i.id === r.listingId),
  );
  const completed = transactions.filter((r) => r.status === "COMPLETED");
  const recent = [...state.listings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const item = id ? state.listings.find((i) => i.id === id) : null;
  function open(target) {
    setError("");
    setPending(target);
  }
  async function moderate() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({
        type: "moderate",
        id: pending.id,
        archive: !pending.archived_at,
      });
      setPending(null);
      notify("Listing moderation saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page admin-page">
      <BackButton fallback={id ? "/admin" : "/profile"} />
      <div className="page-heading">
        <span className="eyebrow">ADMIN · {realtimeStatus}</span>
        <h1>{id ? "Listing review" : "Marketplace overview"}</h1>
      </div>
      {id ? (
        item ? (
          <div className="admin-detail">
            <ProductImage item={item} />
            <div>
              <h2>{item.name}</h2>
              <StatusBadge
                status={item.archived_at ? "ARCHIVED" : item.status}
              />
              {item.is_demo && (
                <span className="demo-label">Demo · browse only</span>
              )}
              <p>
                {currency(item.price)} · {item.residence}
              </p>
              <p>{item.description}</p>
              <p className="small muted">
                Seller:{" "}
                {state.profiles.find((p) => p.id === item.sellerId)?.name ||
                  "Student"}
              </p>
              <button
                className="button secondary"
                disabled={item.status !== "AVAILABLE"}
                onClick={() => open(item)}
              >
                {item.archived_at ? "Restore listing" : "Archive listing"}
              </button>
              <p className="small muted">
                Reserved and completed listings cannot be archived.
              </p>
            </div>
          </div>
        ) : (
          <EmptyState title="Listing unavailable" />
        )
      ) : (
        <>
          <p className="small muted">
            Real activity only. {state.listings.filter((i) => i.is_demo).length}{" "}
            demo listings excluded from totals.
          </p>
          <div className="admin-stats">
            {[
              ["Users", state.profiles.filter((p) => !p.is_demo).length],
              [
                "Active listings",
                listings.filter(
                  (i) => i.status === "AVAILABLE" && !i.archived_at,
                ).length,
              ],
              [
                "Reserved listings",
                listings.filter((i) => i.status === "RESERVED").length,
              ],
              [
                "Active reservations",
                transactions.filter((r) => r.status === "RESERVED").length,
              ],
              ["Completed handoffs", completed.length],
              [
                "Estimated kg diverted",
                completed.reduce((sum, r) => sum + r.weight, 0).toFixed(1),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="admin-columns">
            <section>
              <h2>Recent listings</h2>
              {recent.length ? (
                recent.map((i) => (
                  <Link
                    className="admin-row"
                    to={`/admin/listing/${i.id}`}
                    key={i.id}
                  >
                    <span>
                      {i.name}
                      {i.is_demo && <small>Demo</small>}
                    </span>
                    <StatusBadge
                      status={i.archived_at ? "ARCHIVED" : i.status}
                    />
                  </Link>
                ))
              ) : (
                <p>No listings yet.</p>
              )}
            </section>
            <section>
              <h2>Recent transactions</h2>
              {[...transactions]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 10)
                .map((r) => (
                  <div className="admin-row" key={r.id}>
                    <span>
                      {state.listings.find((i) => i.id === r.listingId)?.name}
                      <small>
                        {r.pickupDate} ·{" "}
                        {state.profiles.find((p) => p.id === r.buyerId)?.name}
                      </small>
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              {!transactions.length && <p>No transactions yet.</p>}
            </section>
          </div>
          <p className="small muted">
            Category-weight estimates, not measured environmental outcomes.
          </p>
        </>
      )}
      {pending && (
        <Modal
          title={
            pending.archived_at
              ? "Restore this listing?"
              : "Archive this listing?"
          }
          onClose={() => !busy && setPending(null)}
        >
          <p>
            {pending.archived_at
              ? "Return this listing to Browse."
              : "Hide this listing from Browse and prevent new reservations. No data will be deleted."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={moderate}
            >
              {busy ? "Saving…" : pending.archived_at ? "Restore" : "Archive"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
