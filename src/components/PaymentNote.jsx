import { Banknote, Gift } from "lucide-react";

export default function PaymentNote({ price, compact = false }) {
  const free = Number(price) === 0;
  const Icon = free ? Gift : Banknote;
  return (
    <p className={`payment-note ${compact ? "compact" : ""}`}>
      <Icon size={18} aria-hidden="true" />
      <span>
        {free ? (
          "Free item · no payment needed."
        ) : compact ? (
          "Cash or direct transfer at handoff."
        ) : (
          <>
            <strong>Direct payment at handoff</strong>
            <span>Cash or direct transfer between buyer and seller.</span>
            <small>
              KostCycle does not process, verify or guarantee payments.
            </small>
          </>
        )}
      </span>
    </p>
  );
}
