import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../context/store";
import { EmptyState, ProductImage, StatusBadge } from "../components/UI";
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

function PickupDetail({ id }) {
  const { state } = useApp();
  const [handedOver, setHandedOver] = useState(false);
  const user = state.currentUser;
  const reservation = state.reservations.find(
    (row) =>
      row.id === id && (row.buyerId === user.id || row.sellerId === user.id),
  );
  const item = state.listings.find((row) => row.id === reservation?.listingId);
  const buyer = reservation?.buyerId === user.id;
  const completed = reservation?.status === "COMPLETED";
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
              <h1>{completed ? "Pickup completed" : "Your pickup"}</h1>
            </div>
            <StatusBadge status={reservation.status} />
          </div>
          <TransactionSteps
            status={reservation.status}
            phase={buyer ? "arrange" : handedOver ? "verify" : "meet"}
          />
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
              {!completed && (
                <p className="small muted">
                  Agree an exact time directly. Meet in a shared public area.
                </p>
              )}
              <PaymentNote price={item.price} />
            </section>
            <section className="form-section pickup-action">
              {completed ? (
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
            </section>
          </div>
        </>
      )}
    </div>
  );
}
