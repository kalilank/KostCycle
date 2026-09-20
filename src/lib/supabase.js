import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function validPublicKey(value) {
  if (!value || value.startsWith("sb_secret_")) return false;
  if (value.startsWith("sb_publishable_")) return true;
  // Also accept Supabase's legacy anon JWT, never a service-role JWT.
  try {
    return (
      JSON.parse(
        atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role === "anon"
    );
  } catch {
    return false;
  }
}
export const configurationError =
  !url || !validPublicKey(key)
    ? "Supabase configuration is missing or invalid. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the project URL and publishable key, then restart Vite."
    : "";
export const supabase = configurationError
  ? null
  : createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
