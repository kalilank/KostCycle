import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppContext } from "./store";
import { supabase, configurationError } from "../lib/supabase";
import { addView, readViews, saveViews } from "../utils/viewHistory";
import {
  readInterests,
  resolveInterests,
  saveInterests,
} from "../utils/interests";
import {
  markRead,
  readLastRead,
  saveLastRead,
  unreadReservations,
} from "../utils/chat";
import { IMAGE_BUCKET, listingImagePath } from "../utils/images";
import {
  emptyState,
  fetchMarketplace,
  check,
  listingPayload,
  mapListing,
  readableError,
} from "../lib/marketplaceApi";

export default function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState(emptyState);
  const [loadedFor, setLoadedFor] = useState(undefined);
  const [error, setError] = useState(configurationError);
  const [toast, setToast] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting");
  const identity = useRef(undefined);
  const request = useRef(0);
  const lastExpiry = useRef(0);
  const userId = session?.user?.id || null;
  const [histories, setHistories] = useState({});
  const historyKey = userId || "guest";
  const viewHistory = histories[historyKey] || readViews(userId);
  const recordView = useCallback(
    (item) => {
      const rows = addView(readViews(userId), item);
      saveViews(userId, rows);
      setHistories((previous) => ({ ...previous, [userId || "guest"]: rows }));
    },
    [userId],
  );
  // Onboarding interests. Guests keep them on this device; signed-in users
  // also save them to their private profile_preferences row.
  const [interestStore, setInterestStore] = useState({});
  const deviceInterests =
    historyKey in interestStore
      ? interestStore[historyKey]
      : readInterests(userId) || (userId ? readInterests(null) : null);
  const resolvedInterests = resolveInterests({
    signedIn: !!userId && !!state.currentUser,
    server: state.preferences,
    local: deviceInterests,
  });
  const interests = resolvedInterests.value;
  const saveRemoteInterests = useCallback(
    async (clean) => {
      if (!supabase || !userId || !clean) return;
      const { error: saveError } = await supabase
        .from("profile_preferences")
        .upsert({ interests: clean }, { onConflict: "user_id" });
      if (saveError)
        setToast("Your interests are saved on this device for now.");
    },
    [userId],
  );
  const setInterests = useCallback(
    (prefs) => {
      const clean = saveInterests(userId, prefs);
      setInterestStore((previous) => ({
        ...previous,
        [userId || "guest"]: clean,
      }));
      if (userId && clean) {
        setState((previous) => ({ ...previous, preferences: clean }));
        void saveRemoteInterests(clean);
      }
      return clean;
    },
    [userId, saveRemoteInterests],
  );
  // Answers given before signing in are uploaded once to the new account.
  const migrated = useRef(null);
  useEffect(() => {
    if (!resolvedInterests.migrate || migrated.current === userId) return;
    migrated.current = userId;
    setState((previous) => ({ ...previous, preferences: interests }));
    void saveRemoteInterests(interests);
  }, [resolvedInterests.migrate, interests, userId, saveRemoteInterests]);
  // Chat read markers for unread dots (per user, on this device).
  const [readStore, setReadStore] = useState({});
  const lastRead =
    historyKey in readStore ? readStore[historyKey] : readLastRead(userId);
  const markChatRead = useCallback(
    (reservationId, at) => {
      if (!userId || !reservationId || !at) return;
      setReadStore((previous) => {
        const current =
          userId in previous ? previous[userId] : readLastRead(userId);
        const next = markRead(current, reservationId, at);
        if (next === current) return previous;
        saveLastRead(userId, next);
        return { ...previous, [userId]: next };
      });
    },
    [userId],
  );
  const unread = useMemo(
    () => unreadReservations(state.messageMeta, userId, lastRead),
    [state.messageMeta, userId, lastRead],
  );
  const notify = useCallback((message) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const id = next?.user?.id || null;
      if (identity.current !== id) {
        identity.current = id;
        request.current++;
        setState(emptyState());
        setLoadedFor(undefined);
      }
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    if (!supabase || session === undefined) return;
    const ticket = ++request.current;
    try {
      // Release overdue pickups (no cron job needed); at most every 25 s.
      if (Date.now() - lastExpiry.current > 25000) {
        lastExpiry.current = Date.now();
        await supabase.rpc("expire_overdue_reservations").then(
          () => {},
          () => {},
        );
      }
      const next = await fetchMarketplace(userId);
      if (ticket === request.current && identity.current === userId) {
        setState(next);
        setError("");
      }
    } catch (e) {
      if (ticket === request.current) setError(readableError(e));
    } finally {
      if (ticket === request.current) setLoadedFor(userId);
    }
  }, [session, userId]);
  useEffect(() => {
    if (!supabase || session === undefined) return;
    let timer;
    const reconcile = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    reconcile();
    const channel = supabase.channel(`marketplace-${userId || "guest"}`);
    for (const table of [
      "profiles",
      "listings",
      "reservations",
      "saved_items",
      "reservation_messages",
    ]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        reconcile,
      );
    }
    channel.subscribe((status) => {
      setRealtimeStatus(
        status === "SUBSCRIBED" ? "Live updates" : "Reconnecting",
      );
      if (status === "SUBSCRIBED") reconcile();
    });
    const interval = setInterval(reconcile, 30000);
    window.addEventListener("focus", reconcile);
    window.addEventListener("online", reconcile);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("online", reconcile);
      supabase.removeChannel(channel);
    };
  }, [refresh, session, userId]);
  async function dispatch(action) {
    if (!supabase) throw new Error(configurationError);
    if (!userId) throw new Error("Sign in to use this feature.");
    let result;
    let listing;
    try {
      if (action.type === "logout") {
        result = await supabase.auth.signOut({ scope: "local" });
      } else if (action.type === "create") {
        result = await supabase
          .from("listings")
          .insert({
            ...listingPayload(action.listing),
            seller_id: userId,
            university: state.currentUser.university,
            campus: state.currentUser.campus,
          })
          .select()
          .single();
        if (result.data) listing = mapListing(result.data);
      } else if (action.type === "update") {
        result = await supabase
          .from("listings")
          .update(listingPayload(action.listing))
          .eq("id", action.id)
          .eq("seller_id", userId)
          .eq("status", "AVAILABLE")
          .select()
          .single();
        if (result.data) listing = mapListing(result.data);
      } else if (action.type === "delete") {
        result = await supabase
          .from("listings")
          .delete()
          .eq("id", action.id)
          .eq("seller_id", userId)
          .eq("status", "AVAILABLE")
          .select("id")
          .single();
      } else if (action.type === "reserve") {
        result = await supabase.rpc("reserve_item", {
          p_listing_id: action.id,
          p_pickup_period: action.period,
        });
      } else if (action.type === "cancel") {
        result = await supabase.rpc("cancel_reservation", {
          p_listing_id: action.id,
        });
      } else if (action.type === "complete") {
        result = await supabase.rpc("confirm_handoff", {
          p_listing_id: action.id,
          p_code: action.code.trim(),
        });
        if (!result.error && !result.data?.ok)
          throw new Error(
            result.data?.message || "Handoff could not be confirmed.",
          );
      } else if (action.type === "save") {
        result = state.saved.includes(action.id)
          ? await supabase
              .from("saved_items")
              .delete()
              .eq("user_id", userId)
              .eq("listing_id", action.id)
          : await supabase
              .from("saved_items")
              .insert({ user_id: userId, listing_id: action.id });
        if (result.error?.code === "23505") result.error = null;
      } else if (action.type === "moderate") {
        result = await supabase.rpc("moderate_listing", {
          p_listing_id: action.id,
          p_archive: action.archive,
        });
      } else if (action.type === "profile") {
        const { name, university, campus, residence } = action.profile;
        result = await supabase
          .from("profiles")
          .update({ name, university, campus, residence })
          .eq("id", userId)
          .select()
          .single();
      } else throw new Error("Unsupported action.");
      if (result.error) throw result.error;
      if (action.type !== "logout") await refresh();
      return {
        listing,
        reservationId: action.type === "reserve" ? result.data : undefined,
      };
    } catch (e) {
      void refresh();
      throw new Error(readableError(e), { cause: e });
    }
  }
  // Photos go to the public listing-images bucket, in the seller's own folder.
  const uploadImage = useCallback(
    async (blob, ext, type) => {
      if (!supabase || !userId) throw new Error("Sign in to upload a photo.");
      const path = listingImagePath(userId, crypto.randomUUID(), ext);
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, blob, {
          contentType: type,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError)
        throw new Error(
          /bucket not found/i.test(uploadError.message)
            ? "Photo storage is not set up yet. Run the latest migration, then try again."
            : "The photo could not be uploaded. Check your connection and try again.",
        );
      return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data
        .publicUrl;
    },
    [userId],
  );
  // Reservation chat (RLS: only that reservation's buyer and seller).
  const chatApi = useMemo(
    () =>
      supabase && userId
        ? {
            list: async (reservationId) =>
              check(
                await supabase
                  .from("reservation_messages")
                  .select("id,reservation_id,sender_id,body,created_at")
                  .eq("reservation_id", reservationId)
                  .order("created_at")
                  .limit(500),
              ),
            send: async (reservationId, body) =>
              check(
                await supabase
                  .from("reservation_messages")
                  .insert({ reservation_id: reservationId, body })
                  .select("id,reservation_id,sender_id,body,created_at")
                  .single(),
              ),
            subscribe: (reservationId, onMessage) => {
              const channel = supabase
                .channel(`chat-${reservationId}`)
                .on(
                  "postgres_changes",
                  {
                    event: "INSERT",
                    schema: "public",
                    table: "reservation_messages",
                    filter: `reservation_id=eq.${reservationId}`,
                  },
                  (payload) => onMessage(payload.new),
                )
                .subscribe();
              return () => supabase.removeChannel(channel);
            },
          }
        : null,
    [userId],
  );
  return (
    <AppContext.Provider
      value={{
        state,
        session,
        loading: !!supabase && (session === undefined || loadedFor !== userId),
        error,
        refresh,
        dispatch,
        notify,
        realtimeStatus,
        viewHistory,
        recordView,
        interests,
        setInterests,
        uploadImage: supabase ? uploadImage : null,
        chatApi,
        unread,
        markChatRead,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}
