import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  MapPin,
  Plus,
  ArrowRight,
  CheckCircle2,
  LogOut,
  Trash2,
} from "lucide-react";
import { useApp } from "../context/store";
import { residences } from "../data/catalog";
import { currency } from "../utils/marketplace";
import {
  EmptyState,
  Modal,
  ProductImage,
  StatusBadge,
  VerifiedBadge,
} from "../components/UI";

export default function Activity() {
  const { state, dispatch, notify, realtimeStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "listings";
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const user = state.currentUser;
  const mine = state.listings.filter((i) => i.sellerId === user.id);
  const reservations = state.reservations.filter((r) => r.buyerId === user.id);
  const completed = state.listings.filter(
    (i) =>
      i.status === "COMPLETED" &&
      (i.sellerId === user.id ||
        reservations.some((r) => r.listingId === i.id)),
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
    setCode("");
    setModal({ kind, item });
  }
  async function perform(event) {
    event.preventDefault();
    if (busy) return;
    const profile =
      modal.kind === "profile"
        ? Object.fromEntries(new FormData(event.currentTarget))
        : null;
    setBusy(true);
    try {
      if (modal.kind === "profile") {
        await dispatch({ type: "profile", profile });
        notify("Profile updated.");
      }
      if (modal.kind === "delete") {
        await dispatch({ type: "delete", id: modal.item.id });
        notify("Listing deleted.");
      }
      if (modal.kind === "handoff") {
        await dispatch({ type: "complete", id: modal.item.id, code });
        notify("Handoff completed. Your impact has been updated.");
        setParams({ tab: "completed" });
      }
      setModal(null);
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
          <span className="eyebrow muted">YOUR LITTLE CORNER OF THE CYCLE</span>
          <h1>
            My KostCycle<span className="yellow-dot">.</span>
          </h1>
        </div>
        <Link className="button primary" to="/sell">
          <Plus size={18} /> List an item
        </Link>
      </div>
      <div className="profile-panel">
        <span className="avatar large">{user.name[0]}</span>
        <div>
          <h2>{user.name}</h2>
          <p>
            {user.university} · {user.campus}
          </p>
          <button className="text-link" onClick={() => open("profile")}>
            Edit profile
          </button>
          <p>
            <MapPin size={14} /> {user.residence}
          </p>
        </div>
        <div className="profile-verification">
          <VerifiedBadge />
          <small role="status">{realtimeStatus}</small>
          <span>University verification is simulated in this MVP.</span>
        </div>
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
              className={tab === key ? "active" : ""}
              onClick={() => {
                setParams({ tab: key });
              }}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="activity-list">
        {items.length ? (
          items.map((item) => {
            const reservation = state.reservations.find(
              (r) => r.listingId === item.id,
            );
            const seller = state.profiles.find((s) => s.id === item.sellerId);
            const buyer = state.profiles.find(
              (s) => s.id === reservation?.buyerId,
            );
            const sellerView = item.sellerId === user.id;
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
                    <StatusBadge status={item.status} />
                  </div>
                  <strong>{currency(item.price)}</strong>
                  {reservation ? (
                    <div className="reservation-details">
                      <p>
                        {sellerView
                          ? `Reserved by: ${buyer?.name}`
                          : `Seller: ${seller?.name}`}{" "}
                        <VerifiedBadge />
                      </p>
                      <p>
                        <MapPin size={14} />
                        {reservation.location} · {reservation.period} ·{" "}
                        {reservation.pickupDate}
                      </p>
                      {!sellerView && item.status === "RESERVED" && (
                        <div className="activity-code">
                          <div>
                            <span className="eyebrow">PICKUP CODE</span>
                            <strong>{reservation.code || "Syncing…"}</strong>
                          </div>
                          <p>Show this code to the seller during handoff.</p>
                        </div>
                      )}
                      {item.status === "COMPLETED" && (
                        <p className="verified">
                          <CheckCircle2 size={16} /> A good thing, passed on.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="muted">
                      {item.residence} · Waiting for its next home.
                    </p>
                  )}
                  <div className="activity-actions">
                    <Link className="text-link" to={`/item/${item.id}`}>
                      View item <ArrowRight size={14} />
                    </Link>
                    {sellerView && item.status === "RESERVED" && (
                      <button
                        className="button primary"
                        onClick={() => open("handoff", item)}
                      >
                        Confirm handoff
                      </button>
                    )}
                    {item.sellerId === user.id &&
                      item.status === "AVAILABLE" && (
                        <>
                          <Link className="text-link" to={`/sell/${item.id}`}>
                            Edit listing
                          </Link>
                          <button
                            className="text-link danger"
                            onClick={() => open("delete", item)}
                          >
                            <Trash2 size={14} /> Delete listing
                          </button>
                        </>
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
                ? "Your first handoff starts here."
                : tab === "reservations"
                  ? "Your next find is nearby."
                  : "Give something a second chapter."
            }
            text="Once you start a cycle, you can follow it right here."
            action={
              <Link
                className="button primary"
                to={tab === "listings" ? "/sell" : "/browse"}
              >
                {tab === "listings" ? "List an item" : "Browse nearby"}
                <ArrowRight size={16} />
              </Link>
            }
          />
        )}
      </div>
      <div className="demo-controls">
        <span>One account to buy, sell, and give away.</span>
        <button
          onClick={async () => {
            try {
              await dispatch({ type: "logout" });
              navigate("/login");
            } catch (e) {
              notify(e.message);
            }
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
      {modal && (
        <Modal
          title={
            modal.kind === "handoff"
              ? "Enter buyer pickup code"
              : modal.kind === "delete"
                ? "Delete this listing?"
                : "Edit student profile"
          }
          onClose={() => !busy && setModal(null)}
        >
          <form onSubmit={perform}>
            {modal.kind === "profile" ? (
              <>
                {["name", "university", "campus"].map((key) => (
                  <label className="field" key={key}>
                    {key}
                    <input
                      name={key}
                      defaultValue={user[key]}
                      required
                      maxLength={key === "name" ? 80 : 120}
                    />
                  </label>
                ))}
                <label className="field">
                  Residence / kost
                  <select name="residence" defaultValue={user.residence}>
                    {residences.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <p className="small muted">Verification remains simulated.</p>
              </>
            ) : modal.kind === "handoff" ? (
              <>
                <p>
                  Ask the buyer to show their code for{" "}
                  <strong>{modal.item.name}</strong>. Check the item together
                  before confirming.
                </p>
                <label className="field">
                  4-digit pickup code
                  <input
                    autoFocus
                    className="code-input"
                    aria-label="Buyer pickup code"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    placeholder="0000"
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <p className="small muted">
                  The code confirms this reservation, not identity. Five
                  incorrect attempts lock verification for 15 minutes.
                </p>
              </>
            ) : (
              <p>
                {modal.kind === "delete"
                  ? `${modal.item.name} will be removed from the marketplace. This cannot be undone.`
                  : ""}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="button-row">
              <button
                disabled={busy}
                className="button secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className={`button ${modal.kind === "delete" ? "destructive" : "primary"}`}
              >
                {modal.kind === "handoff"
                  ? "Verify & complete handoff"
                  : modal.kind === "delete"
                    ? "Delete listing"
                    : "Save profile"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
