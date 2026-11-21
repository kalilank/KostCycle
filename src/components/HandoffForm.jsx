import { useState } from "react";
import { useApp } from "../context/store";
import TransactionSteps from "./TransactionSteps";
import PaymentNote from "./PaymentNote";
export default function HandoffForm({
  item,
  onComplete,
  showProgress = true,
  showPayment = true,
  onHandoffChange,
}) {
  const { dispatch, notify } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handedOver, setHandedOver] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy || !handedOver) return;
    setBusy(true);
    setError("");
    try {
      await dispatch({ type: "complete", id: item.id, code });
      notify("Handoff completed.");
      onComplete?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="handoff-form" onSubmit={submit}>
      {showProgress && (
        <TransactionSteps
          status={item.status}
          phase={handedOver ? "verify" : "meet"}
          compact
        />
      )}
      <p>Hand over the item, then ask the buyer for their code.</p>
      {showPayment && <PaymentNote price={item.price} />}
      <label className="handoff-confirmation">
        <input
          type="checkbox"
          required
          checked={handedOver}
          disabled={busy}
          onChange={(event) => {
            const checked = event.target.checked;
            setHandedOver(checked);
            onHandoffChange?.(checked);
            setError("");
          }}
        />
        <span>I have physically handed the item to the buyer.</span>
      </label>
      <label className="field">
        4-digit pickup code
        <input
          className="code-input"
          aria-label="Buyer pickup code"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          required
          disabled={!handedOver || busy}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <p className="small muted">
        Five incorrect attempts lock verification for 15 minutes.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy || !handedOver || item.status !== "RESERVED"}
        className="button primary full"
      >
        {busy ? "Verifying…" : "Verify code & complete"}
      </button>
    </form>
  );
}
