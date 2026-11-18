import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, Recycle } from "lucide-react";
import { useApp } from "../context/store";
import { supabase, configurationError } from "../lib/supabase";
import { residences } from "../data/catalog";
import {
  STUDENT_EMAIL_DOMAIN,
  authErrorMessage,
  normaliseEmail,
  studentEmailError,
} from "../utils/studentEmail";

export default function Login() {
  const { state } = useApp();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // Address awaiting confirmation, so the student can request a new link.
  const [pendingEmail, setPendingEmail] = useState("");
  if (state.currentUser) return <Navigate to="/activity" replace />;
  async function resend() {
    if (busy || !pendingEmail) return;
    setBusy(true);
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: pendingEmail,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (resendError) throw resendError;
      setMessage(`A new confirmation link was sent to ${pendingEmail}.`);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    setPendingEmail("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const { password, ...profile } = fields;
    const email = normaliseEmail(fields.email);
    delete profile.email;
    if (signup && studentEmailError(email)) {
      setError(studentEmailError(email));
      return;
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error(configurationError);
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
      if (result.error) {
        if (/email_not_confirmed|email not confirmed/i.test(
          `${result.error.code} ${result.error.message}`,
        ))
          setPendingEmail(email);
        throw result.error;
      }
      if (signup && !result.data.session) {
        setPendingEmail(email);
        setMessage(
          `We sent a confirmation link to ${email}. Open it from your BINUS inbox, then sign in. If you already have an account, use Sign In.`,
        );
      }
    } catch (e) {
      setError(authErrorMessage(e));
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
            {signup ? "BINUS student email" : "Email"}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={signup ? `name@${STUDENT_EMAIL_DOMAIN}` : undefined}
            />
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
          {pendingEmail && (
            <button
              type="button"
              className="button secondary full"
              disabled={busy}
              onClick={resend}
            >
              Resend confirmation email
            </button>
          )}
          <button className="button primary full" disabled={busy || !supabase}>
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="small muted">
          New accounts need a @{STUDENT_EMAIL_DOMAIN} address confirmed by
          email. This proves inbox ownership only; student identity is not
          otherwise verified.
        </p>
      </section>
    </div>
  );
}
