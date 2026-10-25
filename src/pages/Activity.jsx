import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "../context/store";
import { currency } from "../utils/marketplace";
import { EmptyState, Modal, ProductImage, StatusBadge } from "../components/UI";
import HandoffForm from "../components/HandoffForm";
import PaymentNote from "../components/PaymentNote";
export default function Activity() {
  const { state, dispatch, notify, realtimeStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "listings";
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const user = state.currentUser;
  const mine = state.listings.filter((i) => i.sellerId === user.id);
  const reservations = state.reservations.filter(
    (r) => r.buyerId === user.id && r.status === "RESERVED",
  );
  const completed = state.listings.filter((i) =>
    state.transactions.some(
      (t) =>
        t.listingId === i.id &&
        (t.buyerId === user.id || t.sellerId === user.id),
    ),
  );
  const items =
    tab === "reservations"
      ? state.listings.filter((i) =>
          reservations.some((r) => r.listingId === i.id),
        )
      : tab === "completed"
        ? completed
        : mine;
  function open(kind, item) {
    setError("");
    setModal({ kind, item });
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ type: "delete", id: modal.item.id });
      setModal(null);
      notify("Listing deleted.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page activity-page">
      <div className="section-heading">
        <div className="page-heading">
          <h1>My Activity</h1>
          <p className="small muted">{realtimeStatus}</p>
        </div>
        <Link className="button primary" to="/sell">
          <Plus size={18} />
          List an item
        </Link>
      </div>
      <div className="activity-toolbar">
        <div className="tabs" aria-label="Activity views">
          {[
            ["listings", "My Listings", mine.length],
            ["reservations", "My Reservations", reservations.length],
            ["completed", "Completed", completed.length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setParams({ tab: key })}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="activity-list">
        {items.some((item) => item.price > 0) && (
          <p className="small muted activity-payment-policy">
            Payments are arranged directly. KostCycle does not process, verify
            or guarantee payments.
          </p>
        )}
        {items.length ? (
          items.map((item) => {
            const reservation = state.reservations.find(
              (r) =>
                r.listingId === item.id &&
                (r.buyerId === user.id || r.sellerId === user.id),
            );
            const owner = item.sellerId === user.id;
            return (
              <article className="activity-card" key={item.id}>
                <Link to={`/item/${item.id}`}>
                  <ProductImage item={item} />
                </Link>
                <div className="activity-item-body">
                  <div className="activity-card-top">
                    <Link to={`/item/${item.id}`}>
                      <h3>{item.name}</h3>
                    </Link>
                    <StatusBadge
                      status={item.archived_at ? "ARCHIVED" : item.status}
                    />
                  </div>
                  <span className="activity-direction">
                    {owner ? "Selling" : "Buying"}
                  </span>
                  <strong>{currency(item.price)}</strong>
                  <p className="muted">
                    {reservation ? reservation.location : item.residence}
                  </p>
                  {reservation && (
                    <p className="small muted pickup-window">
                      {reservation.period} · {reservation.pickupDate}
                    </p>
                  )}
                  <PaymentNote price={item.price} compact />
                  {reservation?.status === "RESERVED" && (
                    <p className="next-action">
                      Next:{" "}
                      {owner
                        ? "Meet & exchange, then verify the code."
                        : "Arrange pickup with the seller."}
                    </p>
                  )}
                  <div className="activity-actions">
                    {reservation && (
                      <Link
                        className={owner ? "text-link" : "button primary"}
                        to={`/reservation/${reservation.id}`}
                      >
                        {reservation.status === "COMPLETED"
                          ? "View completed pickup"
                          : owner
                            ? "Pickup details"
                            : "Show pickup code"}
                      </Link>
                    )}
                    {owner && item.status === "RESERVED" && (
                      <button
                        className="button primary"
                        onClick={() => open("handoff", item)}
                      >
                        Confirm handoff
                      </button>
                    )}
                    {owner &&
                      item.status === "AVAILABLE" &&
                      !item.archived_at && (
                        <>
                          <Link className="text-link" to={`/sell/${item.id}`}>
                            Edit listing
                          </Link>
                          <button
                            className="text-link danger"
                            onClick={() => open("delete", item)}
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </>
                      )}
                    {!reservation && (
                      <Link className="text-link" to={`/item/${item.id}`}>
                        View item
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            title={
              tab === "completed"
                ? "No completed pickups yet"
                : tab === "reservations"
                  ? "No pickups waiting"
                  : "No listings yet"
            }
            text=""
            action={
              <Link
                className="button primary"
                to={tab === "listings" ? "/sell" : "/browse"}
              >
                {tab === "listings" ? "List an item" : "Browse items"}
              </Link>
            }
          />
        )}
      </div>
      {modal && (
        <Modal
          title={
            modal.kind === "handoff"
              ? "Confirm handoff"
              : "Delete this listing?"
          }
          onClose={() => !busy && setModal(null)}
        >
          {modal.kind === "handoff" ? (
            <HandoffForm
              item={
                state.listings.find((i) => i.id === modal.item.id) || modal.item
              }
              onComplete={() => {
                setModal(null);
                setParams({ tab: "completed" });
              }}
            />
          ) : (
            <>
              <p>This removes your listing permanently.</p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={remove}
                >
                  {busy ? "Deleting…" : "Delete listing"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
