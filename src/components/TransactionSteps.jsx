import {
  Search,
  BookmarkCheck,
  CalendarClock,
  Handshake,
  KeyRound,
  Check,
} from "lucide-react";

// Presentation only: the database still uses AVAILABLE → RESERVED → COMPLETED.
export default function TransactionSteps({
  status,
  phase = "arrange",
  compact = false,
}) {
  const active =
    status === "COMPLETED"
      ? 5
      : status === "RESERVED"
        ? phase === "verify"
          ? 4
          : phase === "meet"
            ? 3
            : 2
        : 1;
  return (
    <ol
      className={`transaction-steps ${compact ? "compact" : ""}`}
      aria-label="Pickup journey"
    >
      {[
        ["Browse", Search],
        ["Reserve", BookmarkCheck],
        ["Arrange pickup", CalendarClock],
        ["Meet & exchange", Handshake],
        ["Verify pickup code", KeyRound],
        ["Completed", Check],
      ].map(([label, Icon], index) => (
        <li
          key={label}
          className={index <= active ? "reached" : ""}
          aria-current={index === active ? "step" : undefined}
        >
          <span aria-hidden="true">
            <Icon size={16} />
          </span>
          <b>{label}</b>
        </li>
      ))}
    </ol>
  );
}
