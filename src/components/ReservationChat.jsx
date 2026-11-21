import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useApp } from "../context/store";
import {
  MAX_MESSAGE,
  chatOpen,
  cleanMessage,
  mergeMessages,
} from "../utils/chat";

const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
const dayOf = (iso) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Buyer ↔ seller messages for one reservation, live via Realtime. */
export default function ReservationChat({ reservation, counterpartName }) {
  const { state, chatApi, markChatRead } = useApp();
  const me = state.currentUser?.id;
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef(null);
  const open = chatOpen(reservation);
  const reservationId = reservation.id;

  useEffect(() => {
    if (!chatApi) return;
    let alive = true;
    chatApi
      .list(reservationId)
      .then((rows) => alive && setMessages((m) => mergeMessages(m, rows)))
      .catch(() => alive && setError("Messages could not be loaded."))
      .finally(() => alive && setLoaded(true));
    const stop = chatApi.subscribe(reservationId, (row) =>
      setMessages((m) => mergeMessages(m, row)),
    );
    return () => {
      alive = false;
      stop();
    };
  }, [chatApi, reservationId]);

  const newest = messages.at(-1)?.created_at;
  useEffect(() => {
    if (newest) markChatRead?.(reservationId, newest);
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [newest, reservationId, markChatRead]);

  async function send(event) {
    event.preventDefault();
    if (sending) return;
    const result = cleanMessage(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSending(true);
    setError("");
    try {
      const row = await chatApi.send(reservationId, result.body);
      setMessages((m) => mergeMessages(m, row));
      setDraft("");
    } catch {
      setError("Message not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  if (!chatApi)
    return (
      <section className="chat-panel form-section">
        <h2>
          <MessageCircle size={20} /> Messages
        </h2>
        <p className="small muted">Chat is available when you are online.</p>
      </section>
    );

  let lastDay = "";
  return (
    <section className="chat-panel form-section" aria-label="Messages">
      <div className="chat-heading">
        <h2>
          <MessageCircle size={20} /> Message {counterpartName || "them"}
        </h2>
        <span className="small muted">
          Only you two can see this. Never share your pickup code here before
          the handoff.
        </span>
      </div>
      <div className="chat-list" ref={list} aria-live="polite">
        {!loaded ? (
          <p className="small muted chat-empty">Loading messages…</p>
        ) : messages.length ? (
          messages.map((m) => {
            const day = dayOf(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            const mine = m.sender_id === me;
            return (
              <div key={m.id}>
                {showDay && <p className="chat-day">{day}</p>}
                <div className={`chat-bubble ${mine ? "mine" : "theirs"}`}>
                  <p>{m.body}</p>
                  <time dateTime={m.created_at}>{timeOf(m.created_at)}</time>
                </div>
              </div>
            );
          })
        ) : (
          <p className="small muted chat-empty">
            No messages yet. Say hi and agree a pickup time.
          </p>
        )}
      </div>
      {open ? (
        <form className="chat-form" onSubmit={send}>
          <label className="sr-only" htmlFor={`chat-${reservationId}`}>
            Message
          </label>
          <textarea
            id={`chat-${reservationId}`}
            rows={2}
            maxLength={MAX_MESSAGE}
            placeholder="e.g. Can we meet at the lobby at 5 pm?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
          />
          <button
            className="button primary"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
          >
            <Send size={17} />
          </button>
        </form>
      ) : (
        <p className="small muted">This conversation is closed.</p>
      )}
      {draft.length > MAX_MESSAGE - 100 && (
        <p className="small muted chat-count">
          {draft.length}/{MAX_MESSAGE}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
