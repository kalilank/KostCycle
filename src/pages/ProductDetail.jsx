import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  MapPin,
  Footprints,
  ShieldCheck,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { useApp } from "../context/store";
import { currency, distanceText, meetup } from "../utils/marketplace";
import {
  ProductImage,
  Modal,
  Seller,
  StatusBadge,
  EmptyState,
} from "../components/UI";

export default function ProductDetail() {
  const { id } = useParams();
  const { state, dispatch, notify } = useApp();
  const item = state.listings.find((l) => l.id === id);
  const [modal, setModal] = useState(false);
  const [period, setPeriod] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const reservation = state.reservations.find(
    (r) => r.listingId === id && r.buyerId === state.currentUser?.id,
  );
  if (!item)
    return (
      <div className="container page">
        <EmptyState
          title="This item has moved on."
          text="Explore more essentials in your neighbourhood."
          action={
            <Link to="/browse" className="button primary">
              Browse nearby
            </Link>
          }
        />
      </div>
    );
  const owner = item.sellerId === state.currentUser?.id;
  const saved = state.saved.includes(item.id);
  async function confirm(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ type: "reserve", id, period: period || item.pickup[0] });
      setModal(false);
      notify("Reservation confirmed. Your pickup code is ready.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page detail-page">
      <Link className="back-link" to="/browse">
        <ArrowLeft size={16} /> Back to nearby finds
      </Link>
      <div className="detail-layout">
        <div>
          <div className="detail-image">
            <ProductImage item={item} />
            <span className="photo-caption">
              {item.image ? "Seller photo" : "Illustrative demo photo"}
            </span>
          </div>
          <div className="detail-description">
            <h2>A little about this find</h2>
            <p>{item.description}</p>
            <span className="small muted">
              Listed{" "}
              {new Date(item.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
        <section className="detail-info">
          <div className="detail-top">
            <span className="eyebrow muted">{item.category}</span>
            <StatusBadge status={item.status} />
          </div>
          <h1>{item.name}</h1>
          <div
            className={`detail-price ${item.price === 0 ? "free-price" : ""}`}
          >
            {currency(item.price)}
          </div>
          <p className="muted">
            {item.price === 0
              ? "A good find, yours for a new chapter."
              : "Arrange payment directly at pickup. No in-app payment."}
          </p>
          <dl className="item-facts">
            <div>
              <dt>Condition</dt>
              <dd>{item.condition}</dd>
            </div>
            <div>
              <dt>Residence</dt>
              <dd>{item.residence}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{distanceText(item.distance)} · illustrative estimate</dd>
            </div>
          </dl>
          <Seller id={item.sellerId} />
          {reservation?.status === "RESERVED" ? (
            <div className="reservation-success">
              <h3>
                <CheckCircle2 size={20} /> Reservation confirmed
              </h3>
              <p>
                {reservation.location} · {reservation.period} ·{" "}
                {reservation.pickupDate}
              </p>
              <span className="eyebrow">YOUR PICKUP CODE</span>
              <strong className="pickup-code">
                {reservation.code || "Syncing…"}
              </strong>
              <p>Show this code to the seller during handoff.</p>
              <Link className="text-link" to="/activity?tab=reservations">
                View reservation <ArrowRight size={16} />
              </Link>
            </div>
          ) : item.status === "COMPLETED" ? (
            <div className="success-panel">
              <CheckCircle2 size={22} />
              <div>
                <strong>This find has a new home.</strong>
                <p>Handoff completed. A little less waste.</p>
              </div>
            </div>
          ) : owner ? (
            <Link className="button primary full" to="/activity">
              Manage your listing <ArrowRight size={18} />
            </Link>
          ) : !state.currentUser ? (
            <Link className="button primary full" to="/login">
              Sign in to reserve <ArrowRight size={18} />
            </Link>
          ) : (
            <button
              className="button primary full"
              disabled={item.status !== "AVAILABLE"}
              onClick={() => {
                setError("");
                setModal(true);
              }}
            >
              {item.status === "RESERVED"
                ? "Reserved by another student"
                : "Reserve item"}
              {item.status === "AVAILABLE" && <ArrowRight size={18} />}
            </button>
          )}
          <button
            className="button secondary full save-detail"
            aria-pressed={saved}
            disabled={saving}
            onClick={async () => {
              if (saving) return;
              setSaving(true);
              try {
                await dispatch({ type: "save", id });
                notify(
                  saved ? "Removed from saved items." : "Saved for later.",
                );
              } catch (e) {
                notify(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Heart size={17} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved item" : "Save item"}
          </button>
          <div className="handoff-box">
            <h3>
              <Footprints size={22} /> Local handoff
            </h3>
            <p>No shipping needed. Just a short walk.</p>
            <div>
              <MapPin size={18} />
              <span>
                <strong>{meetup(item)}</strong>
                <small>
                  About {Math.max(1, Math.round(item.distance / 75))} minutes on
                  foot · estimated
                </small>
              </span>
            </div>
            <div>
              <CalendarDays size={18} />
              <span>{item.pickup.join(" · ")}</span>
            </div>
            <p className="safety-note">
              <ShieldCheck size={17} /> Meet in a shared or public area.
            </p>
          </div>
          <p className="small muted">
            University verification is simulated in this MVP.
          </p>
        </section>
      </div>
      {modal && (
        <Modal
          title={`Reserve ${item.name}?`}
          onClose={() => !busy && setModal(false)}
        >
          <form onSubmit={confirm}>
            <div className="modal-product">
              <ProductImage item={item} />
              <div>
                <h3>{item.name}</h3>
                <strong>{currency(item.price)}</strong>
              </div>
            </div>
            <Seller id={item.sellerId} />
            <p className="pickup-location">
              <MapPin size={18} />
              {meetup(item)} · {distanceText(item.distance)}
            </p>
            <label className="field">
              Choose pickup period
              <select
                value={period || item.pickup[0]}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {item.pickup.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <p className="safety-note">
              <ShieldCheck size={17} /> Meet in a shared or public area. Check
              the item before completing your handoff.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || item.status !== "AVAILABLE"}
            >
              {busy ? "Reserving…" : "Confirm reservation"}{" "}
              <ArrowRight size={17} />
            </button>
            <p className="small muted">
              You’ll receive a 4-digit code to show the seller at pickup. It
              confirms this reservation, not your identity.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
