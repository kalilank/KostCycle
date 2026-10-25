// DEV-ONLY UI fixtures. Not imported by src/main.jsx or included in the Vite build.
// No Supabase calls. These verify layout and components, NOT hosted authentication.
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { AppContext } from "../../src/context/store";
import Header, { BottomNav, Footer } from "../../src/components/Header";
import Home from "../../src/pages/Home";
import Browse from "../../src/pages/Browse";
import ProductDetail from "../../src/pages/ProductDetail";
import Activity from "../../src/pages/Activity";
import Sell from "../../src/pages/Sell";
import Profile from "../../src/pages/Profile";
import Admin from "../../src/pages/Admin";
import Reservation from "../../src/pages/Reservation";
import Impact from "../../src/pages/Impact";
import { demoListings } from "../../scripts/demo-data.mjs";
import { productPhotos } from "../../src/data/productPhotos";
import { meetup } from "../../src/utils/marketplace";
import "../../src/style.css";
const people = ["buyer", "seller", "admin"].map((id) => ({
  id,
  name: id === "buyer" ? "null" : `${id[0].toUpperCase() + id.slice(1)} QA`,
  university: "BINUS University",
  campus: "Alam Sutera",
  residence: "Newton Kost",
  role: id === "admin" ? "admin" : "student",
  verified: true,
}));
const catalog = demoListings.map((item, index) => ({
  ...item,
  id: `demo-${index}`,
  sellerId: "demo",
  createdAt: "2026-10-12T12:00:00Z",
  status: "AVAILABLE",
}));
const real = {
  ...catalog[14],
  id: "real",
  sellerId: "seller",
  is_demo: false,
  status: "AVAILABLE",
  name: "Desk lamp for a real pickup (QA only)",
};
const pickup = { ...real, id: "pickup", status: "RESERVED" };
const freePickup = {
  ...pickup,
  id: "free-pickup",
  price: 0,
  name: "Free desk lamp (QA only)",
};
const reservation = {
  id: "reservation",
  listingId: "pickup",
  buyerId: "buyer",
  sellerId: "seller",
  status: "RESERVED",
  code: "1234",
  location: meetup(pickup),
  period: "Today",
  pickupDate: "2026-10-12",
  createdAt: "2026-10-12T12:00:00Z",
  weight: 1,
};
export default function Fixture() {
  const [viewer, setViewer] = useState("buyer");
  const [listings, setListings] = useState([
    real,
    pickup,
    freePickup,
    ...catalog,
  ]);
  const [reservations, setReservations] = useState([
    reservation,
    {
      ...reservation,
      id: "free-reservation",
      listingId: "free-pickup",
      code: "4321",
    },
  ]);
  const [notice, setNotice] = useState("");
  const user = people.find((p) => p.id === viewer);
  const recordView = useCallback(() => {}, []);
  const state = {
    currentUser: user,
    profiles: people,
    listings,
    reservations: reservations.map((r) => ({
      ...r,
      code: viewer === r.buyerId ? r.code : undefined,
    })),
    transactions: reservations.filter((r) => r.status === "COMPLETED"),
    saved: [],
  };
  async function dispatch(action) {
    if (action.type === "reserve") {
      const item = listings.find((row) => row.id === action.id);
      if (
        !item ||
        item.is_demo ||
        item.status !== "AVAILABLE" ||
        viewer === item.sellerId
      )
        throw Error("This item cannot be reserved.");
      const id = "qa-reservation-" + item.id;
      setListings((rows) =>
        rows.map((row) =>
          row.id === item.id ? { ...row, status: "RESERVED" } : row,
        ),
      );
      setReservations((rows) => [
        ...rows,
        {
          ...reservation,
          id,
          listingId: item.id,
          buyerId: viewer,
          period: action.period,
          location: meetup(item),
        },
      ]);
      return { reservationId: id };
    }
    if (action.type === "complete") {
      const target = reservations.find((row) => row.listingId === action.id);
      if (viewer !== "seller" || !target)
        throw Error("Only this seller can confirm.");
      if (action.code !== target.code)
        throw Error("Code does not match this reservation.");
      setReservations((rows) =>
        rows.map((r) =>
          r.id === target.id
            ? {
                ...r,
                status: "COMPLETED",
                completedAt: new Date().toISOString(),
                code: undefined,
              }
            : r,
        ),
      );
      setListings((rows) =>
        rows.map((i) =>
          i.id === action.id ? { ...i, status: "COMPLETED" } : i,
        ),
      );
      return;
    }
    throw Error(
      "Read-only UI fixture. Use real accounts for the hosted acceptance test.",
    );
  }
  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        notify: setNotice,
        viewHistory: [],
        recordView,
        realtimeStatus: "UI fixture (not live)",
      }}
    >
      <MemoryRouter>
        <aside style={{ padding: 12, background: "#eee", fontSize: 12 }}>
          <strong>Isolated QA · no production writes</strong>
          <label>
            {" "}
            Viewer{" "}
            <select
              aria-label="Fixture viewer"
              value={viewer}
              onChange={(e) => setViewer(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              ["/", "Home"],
              ["/browse", "Browse"],
              ["/sell", "Sell"],
              ["/activity", "Activity"],
              ["/profile", "Profile"],
              ["/admin", "Admin"],
              ["/item/real", "Item"],
              ["/reservation/reservation", "Pickup"],
              ["/reservation/free-reservation", "Free pickup"],
              ["/impact", "Impact"],
              ["/photos", "Photo QA"],
            ].map(([to, label]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </div>
        </aside>
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/item/:id" element={<ProductDetail />} />
            <Route path="/sell" element={<Sell key={viewer} />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/profile" element={<Profile key={viewer} />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/listing/:id" element={<Admin />} />
            <Route path="/reservation/:id" element={<Reservation />} />
            <Route path="/impact" element={<Impact />} />
            <Route
              path="/photos"
              element={
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                    gap: 12,
                    padding: 16,
                  }}
                >
                  {productPhotos.map((photo) => (
                    <figure key={photo.key} style={{ margin: 0 }}>
                      <img
                        src={photo.src}
                        alt={photo.key}
                        style={{
                          width: "100%",
                          aspectRatio: "1",
                          objectFit: "cover",
                        }}
                      />
                      <figcaption>
                        {photo.key} · {photo.photographer}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              }
            />
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        {notice && (
          <div role="status" className="toast">
            {notice}
          </div>
        )}
      </MemoryRouter>
    </AppContext.Provider>
  );
}
if (import.meta.env.DEV) {
  const root =
    import.meta.hot?.data.root || createRoot(document.getElementById("root"));
  root.render(<Fixture />);
  if (import.meta.hot)
    import.meta.hot.dispose((data) => {
      data.root = root;
    });
}
