import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Leaf, ShieldCheck, LogOut } from "lucide-react";
import { useApp } from "../context/store";
import { residences } from "../data/catalog";
import { VerifiedBadge } from "../components/UI";
import BackButton from "../components/BackButton";
export default function Profile() {
  const { state, dispatch, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const user = state.currentUser;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const profile = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    try {
      await dispatch({ type: "profile", profile });
      notify("Profile saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page profile-page">
      <BackButton fallback="/" />
      <div className="page-heading">
        <h1>My Profile</h1>
        <VerifiedBadge />
      </div>
      <div className="profile-shortcuts">
        <Link className="button secondary" to="/browse?saved=1">
          <Heart size={18} />
          Saved items
        </Link>
        <Link className="button secondary" to="/impact">
          <Leaf size={18} />
          Your Impact
        </Link>
        {user.role === "admin" && (
          <Link className="button secondary" to="/admin">
            <ShieldCheck size={18} />
            Admin
          </Link>
        )}
      </div>
      <form
        className="form-section profile-form"
        onSubmit={submit}
        key={user.id}
      >
        {["name", "university", "campus"].map((key) => (
          <label className="field" key={key}>
            {key[0].toUpperCase() + key.slice(1)}
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
            {[...new Set([...residences, user.residence])].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
      <button
        className="text-link signout"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await dispatch({ type: "logout" });
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogOut size={17} />
        Sign out
      </button>
    </div>
  );
}
