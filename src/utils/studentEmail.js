// Sign-up is limited to BINUS student addresses. The database migration
// 202610260001_binus_student_email.sql enforces the same rule server-side.
export const STUDENT_EMAIL_DOMAIN = "binus.ac.id";

export function normaliseEmail(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

// Exact domain only: rejects subdomains and look-alikes such as
// "x@mail.binus.ac.id" or "x@notbinus.ac.id".
export function isStudentEmail(value) {
  const email = normaliseEmail(value);
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at || /\s/.test(email)) return false;
  return email.slice(at + 1) === STUDENT_EMAIL_DOMAIN;
}

export function studentEmailError(value) {
  return isStudentEmail(value)
    ? ""
    : `Use your BINUS student email (name@${STUDENT_EMAIL_DOMAIN}) to create an account.`;
}

// Maps Supabase Auth errors from sign-up/sign-in to student-facing messages.
export function authErrorMessage(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (/binus_email_required|database error saving new user/i.test(text))
    return studentEmailError("");
  if (/email_not_confirmed|email not confirmed/i.test(text))
    return "Confirm your email first: open the link we sent to your BINUS inbox, then sign in.";
  return error?.message || "Something went wrong. Please try again.";
}
