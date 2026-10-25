import { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppProvider from "./context/AppProvider";
import { useApp } from "./context/store";
import Header, { Footer, BottomNav } from "./components/Header";
import { EmptyState } from "./components/UI";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Browse from "./pages/Browse";
import ProductDetail from "./pages/ProductDetail";
import Sell from "./pages/Sell";
import Activity from "./pages/Activity";
import Impact from "./pages/Impact";
import Profile from "./pages/Profile";
import Reservation from "./pages/Reservation";
import Admin from "./pages/Admin";

function Protected({ children }) {
  const { state } = useApp();
  return state.currentUser ? children : <Navigate to="/login" replace />;
}
function AdminOnly({ children }) {
  const { state } = useApp();
  return (
    <Protected>
      {state.currentUser?.role === "admin" ? (
        children
      ) : (
        <div className="container page">
          <EmptyState
            title="Admin access required"
            text="This page is restricted to administrators."
            action={
              <Link className="button primary" to="/profile">
                My Profile
              </Link>
            }
          />
        </div>
      )}
    </Protected>
  );
}
function Shell() {
  const location = useLocation();
  const { error, loading, refresh } = useApp();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${location.pathname === "/" ? "Good finds, close to home" : location.pathname.split("/")[1].replace(/^./, (c) => c.toUpperCase())} · KostCycle`;
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      {error && (
        <div className="storage-error" role="alert">
          {error}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      <main id="main-content">
        {loading ? (
          <div className="container page" role="status">
            Loading your neighbourhood…
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/browse" element={<Browse />} />
            <Route
              path="/profile"
              element={
                <Protected>
                  <Profile />
                </Protected>
              }
            />
            <Route
              path="/reservation/:id"
              element={
                <Protected>
                  <Reservation />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminOnly>
                  <Admin />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/listing/:id"
              element={
                <AdminOnly>
                  <Admin />
                </AdminOnly>
              }
            />
            <Route path="/item/:id" element={<ProductDetail />} />
            <Route
              path="/sell/:id"
              element={
                <Protected>
                  <Sell key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/sell"
              element={
                <Protected>
                  <Sell key={location.pathname} />
                </Protected>
              }
            />
            <Route
              path="/activity"
              element={
                <Protected>
                  <Activity />
                </Protected>
              }
            />
            <Route
              path="/impact"
              element={
                <Protected>
                  <Impact />
                </Protected>
              }
            />
            <Route
              path="*"
              element={
                <div className="container page">
                  <EmptyState
                    title="This page has moved out."
                    text="There are still plenty of good finds nearby."
                    action={
                      <Link className="button primary" to="/">
                        Back to home
                      </Link>
                    }
                  />
                </div>
              }
            />
          </Routes>
        )}
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
