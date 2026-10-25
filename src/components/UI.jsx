import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Heart,
  MapPin,
  Package,
  X,
} from "lucide-react";
import { categoryIcons } from "./categoryIcons";
import { useApp } from "../context/store";
import { currency, distanceText } from "../utils/marketplace";
import { productPhoto } from "../data/productPhotos";

export function VerifiedBadge({ compact = false }) {
  return (
    <span className="verified">
      <BadgeCheck size={15} />
      {compact ? "Verified · simulated" : "Student verification · simulated"}
    </span>
  );
}
export function StatusBadge({ status }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      {status === "AVAILABLE"
        ? "Available"
        : status === "RESERVED"
          ? "Reserved"
          : status === "ARCHIVED"
            ? "Archived"
            : "Completed"}
    </span>
  );
}
export function ProductImage({ item, className = "" }) {
  const [failed, setFailed] = useState(false);
  const Icon = categoryIcons[item.category] || Package;
  const photo = productPhoto(item);
  return (
    <div className={`product-image ${className}`}>
      <div className="image-fallback">
        <Icon size={52} strokeWidth={1} />
        <span>{item.category}</span>
      </div>
      {failed !== photo.src && (
        <img
          src={photo.src}
          alt={
            photo.illustrative
              ? `${item.category}: illustrative photograph`
              : item.name
          }
          loading="lazy"
          decoding="async"
          onError={() => setFailed(photo.src)}
        />
      )}
      {photo.illustrative && (
        <span className="illustrative-label">Illustrative</span>
      )}
    </div>
  );
}
export function ProductCard({ item }) {
  const { state, dispatch, notify } = useApp();
  const saved = state.saved.includes(item.id);
  const [saving, setSaving] = useState(false);
  async function toggleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await dispatch({ type: "save", id: item.id });
      notify(saved ? "Removed from saved items." : "Saved for later.");
    } catch (e) {
      notify(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="product-card">
      <div className="product-visual">
        <Link to={`/item/${item.id}`} aria-label={`View ${item.name}`}>
          <ProductImage item={item} />
        </Link>
        <span className={`condition ${item.price === 0 ? "free-tag" : ""}`}>
          {item.price === 0 ? "FREE TO TAKE" : item.condition}
        </span>
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          onClick={toggleSave}
          disabled={saving}
          aria-label={`${saved ? "Unsave" : "Save"} ${item.name}`}
          aria-pressed={saved}
        >
          <Heart size={18} fill={saved ? "currentColor" : "none"} />
        </button>
        {item.status !== "AVAILABLE" && (
          <div className="image-status">
            <StatusBadge status={item.status} />
          </div>
        )}
      </div>
      <div className="product-meta">
        <span>{item.category}</span>
        <span>{item.condition}</span>
      </div>
      {item.is_demo && <span className="demo-label">Demo · browse only</span>}
      <Link className="product-title" to={`/item/${item.id}`}>
        {item.name}
        <ArrowUpRight size={18} />
      </Link>
      <strong className={`price ${item.price === 0 ? "free-price" : ""}`}>
        {currency(item.price)}
      </strong>
      <div className="product-location">
        <MapPin size={13} />
        <span>{item.residence}</span>
        <b>{distanceText(item.distance)} est.</b>
      </div>
      {item.recommendationReason && (
        <p className="recommendation-reason">{item.recommendationReason}</p>
      )}
    </article>
  );
}
export function ProductGrid({ items }) {
  return items.length ? (
    <div className="product-grid">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  ) : (
    <EmptyState
      title="Nothing here just yet"
      text="Try a different search or clear a filter to find more nearby."
    />
  );
}
export function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state">
      <Package size={38} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Seller({ id }) {
  const { state } = useApp();
  const seller = state.profiles.find((s) => s.id === id);
  return (
    <div className="seller">
      <span className="avatar">{seller?.name.slice(0, 1) || "S"}</span>
      <div>
        <strong>{seller?.name || "Student"}</strong>
        {seller?.verified && <VerifiedBadge />}
      </div>
    </div>
  );
}
