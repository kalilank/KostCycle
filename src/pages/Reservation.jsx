import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Clock, XCircle } from "lucide-react";
import { useApp } from "../context/store";
import { EmptyState, Modal, ProductImage, StatusBadge } from "../components/UI";
import ReservationChat from "../components/ReservationChat";
import { canCancel, endedLabel, timeLeft } from "../utils/reservations";
import BackButton from "../components/BackButton";
import TransactionSteps from "../components/TransactionSteps";
import HandoffForm from "../components/HandoffForm";
import PaymentNote from "../components/PaymentNote";
import { currency } from "../utils/marketplace";

export default function Reservation() {
  const { id } = useParams();
  const { state } = useApp();
  // A different pickup or account starts with a fresh handoff confirmation.
  return <PickupDetail key={`${id}:${state.currentUser?.id}`} id={id} />;
}

// Re-render every 30 s so the countdown stays current.
function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

function PickupDetail({ id }) {
  const { state, dispatch, notify } = useApp();
  const [handedOver, setHandedOver] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = useNow();
  const user = state.currentUser;
  const reservation = state.reservations.find(
    (row) =>
      row.id === id && (row.buyerId === user.id || row.sellerId === user.id),
  );
  const item = state.listings.find((row) => row.id === reservation?.listingId);
  const buyer = reservation?.buyerId === user.id;
  const completed = reservation?.status === "COMPLETED";
  const ended =
    reservation?.status === "CANCELLED" || reservation?.status === "EXPIRED";
  const hold = timeLeft(reservation?.expiresAt, now);
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await dispatch({ type: "cancel", id: reservation.listingId });
      setConfirmCancel(false);
      notify("Reservation cancelled. The item is available again.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const counterpart = state.profiles.find(
    (profile) =>
      profile.id === (buyer ? reservation?.sellerId : reservation?.buyerId),
  );
  return (
    <div className="container page reservation-page">
      <BackButton
        fallback={buyer ? "/activity?tab=reservations" : "/activity"}
      />
      {!reservation || !item ? (
        <EmptyState
          title="Reservation unavailable"
          text="Only the buyer and seller can open this pickup."
        />
      ) : (
        <>
          <div className="reservation-heading">
            <div className="page-heading">
              <span className="eyebrow muted">
                {buyer ? "BUYING" : "SELLING"}
              </span>
              <h1>
                {completed
                  ? "Pickup completed"
                  : reservation.status === "CANCELLED"
                    ? "Reservation cancelled"
                    : reservation.status === "EXPIRED"
                      ? "Reservation expired"
                      : "Your pickup"}
              </h1>
            </div>
            <StatusBadge status={reservation.status} />
          </div>
          {reservation.status === "RESERVED" && hold.text && (
            <p className={`hold-timer ${hold.urgent ? "urgent" : ""}`}>
              <Clock size={16} />
              <span>
                <strong>{hold.text}</strong> to confirm the handoff. After that
                the item is released for other students.
              </span>
            </p>
          )}
          {!ended && (
            <TransactionSteps
              status={reservation.status}
              phase={buyer ? "arrange" : handedOver ? "verify" : "meet"}
            />
          )}
          <div className="reservation-layout">
            <section className="pickup-summary">
              <Link className="pickup-item" to={"/item/" + item.id}>
                <ProductImage item={item} />
                <div>
                  <h2>{item.name}</h2>
                  <strong>{currency(item.price)}</strong>
                </div>
              </Link>
              <p className="pickup-person">
                {buyer ? "Seller" : "Buyer"}:{" "}
                <strong>{counterpart?.name ?? "Student"}</strong>
              </p>
              <dl className="item-facts">
                <div>
                  <dt>Pickup location</dt>
                  <dd>{reservation.location}</dd>
                </div>
                <div>
                  <dt>Pickup window</dt>
                  <dd>
                    {reservation.period} · {reservation.pickupDate}
                  </dd>
                </div>
              </dl>
              {reservation.status === "RESERVED" && (
                <p className="small muted">
                  Agree an exact time directly. Meet in a shared public area.
                </p>
              )}
              <PaymentNote price={item.price} />
            </section>
            <section className="form-section pickup-action">
              {ended ? (
                <>
                  <h2>
                    <XCircle size={20} />{" "}
                    {reservation.status === "EXPIRED"
                      ? "Hold expired"
                      : "Cancelled"}
                  </h2>
                  <p>{endedLabel(reservation, user.id)}</p>
                  <Link className="button primary" to="/browse">
                    Browse other finds
                  </Link>
                </>
              ) : completed ? (
                <>
                  <h2>Exchange complete</h2>
                  <p>
                    Your impact is updated. The pickup code is no longer active.
                  </p>
                  <Link className="button primary" to="/impact">
                    View impact
                  </Link>
                </>
              ) : buyer ? (
                <>
                  <span className="eyebrow muted">YOUR NEXT STEP</span>
                  <h2>Arrange pickup</h2>
                  <p>
                    Agree a time with your seller, then meet and check the item.
                  </p>
                  <div className="private-code">
                    <span className="eyebrow">YOUR PRIVATE PICKUP CODE</span>
                    <strong
                      className="pickup-code"
                      aria-label="Your private pickup code"
                    >
                      {reservation.code || "Syncing…"}
                    </strong>
                    <p>
                      Share this with the seller only after you receive the
                      item.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="eyebrow muted">YOUR NEXT STEP</span>
                  <h2>
                    {handedOver ? "Verify pickup code" : "Meet & exchange"}
                  </h2>
                  <HandoffForm
                    item={item}
                    showProgress={false}
                    showPayment={false}
                    onHandoffChange={setHandedOver}
                  />
                </>
              )}
              {canCancel(reservation, user.id) && (
                <button
                  className="text-link danger cancel-reservation"
                  onClick={() => {
                    setError("");
                    setConfirmCancel(true);
                  }}
                >
                  Cancel reservation
                </button>
              )}
            </section>
          </div>
          <ReservationChat
            reservation={reservation}
            counterpartName={counterpart?.name}
          />
          {confirmCancel && (
            <Modal
              title="Cancel this reservation?"
              onClose={() => !busy && setConfirmCancel(false)}
            >
              <p>
                {buyer
                  ? "The item goes back on the marketplace and your pickup code stops working."
                  : "The buyer\u2019s hold is released, their pickup code stops working, and your item goes back on the marketplace."}
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
                  onClick={() => setConfirmCancel(false)}
                >
                  Keep reservation
                </button>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={cancel}
                >
                  {busy ? "Cancelling\u2026" : "Cancel reservation"}
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
