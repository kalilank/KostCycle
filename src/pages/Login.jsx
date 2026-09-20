import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, Recycle } from "lucide-react";
import { useApp } from "../context/store";
import { supabase, configurationError } from "../lib/supabase";
import { residences } from "../data/catalog";

export default function Login() {
  const { state } = useApp();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (state.currentUser) return <Navigate to="/activity" replace />;
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (!supabase) throw new Error(configurationError);
      const { email, password, ...profile } = fields;
      const result = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: profile,
              emailRedirectTo: `${window.location.origin}/login`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Check your email to confirm your account, then sign in. If you already have an account, use Sign In.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page login-page">
      <section className="login-story">
        <Recycle size={48} />
        <span className="eyebrow">GOOD FINDS. GOOD NEIGHBOURS.</span>
        <h1>A new home for your old favourites.</h1>
        <p>
          Buy, sell, or give away with students near you. One account. Both
          sides of a good exchange.
        </p>
      </section>
      <section className="login-card">
        <h2>{signup ? "Join your neighbourhood." : "Welcome back."}</h2>
        <div className="segmented">
          <button
            type="button"
            className={!signup ? "selected" : ""}
            onClick={() => {
              setSignup(false);
              setError("");
              setMessage("");
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={signup ? "selected" : ""}
            onClick={() => {
              setSignup(true);
              setError("");
              setMessage("");
            }}
          >
            Sign Up
          </button>
        </div>
        <form onSubmit={submit}>
          {signup && (
            <>
              <label className="field">
                Name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                University
                <input
                  name="university"
                  required
                  maxLength={120}
                  defaultValue="BINUS University"
                />
              </label>
              <label className="field">
                Campus
                <input
                  name="campus"
                  required
                  maxLength={120}
                  defaultValue="Alam Sutera"
                />
              </label>
              <label className="field">
                Residence / kost
                <select name="residence">
                  {residences.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="field">
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={signup ? 8 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="success-panel" role="status">
              {message}
            </p>
          )}
          <button className="button primary full" disabled={busy || !supabase}>
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="small muted">
          Student and university verification is simulated for this MVP. No
          student identity has been independently verified.
        </p>
      </section>
    </div>
  );
}
