import { useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Search,
  MapPin,
  Repeat2,
  Plus,
  Heart,
  Menu,
  X,
  UserRound,
  House,
  ClipboardList,
} from "lucide-react";
import { useApp } from "../context/store";

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="KostCycle home">
      <span className="brand-icon">
        <Repeat2 size={24} strokeWidth={2.5} />
      </span>
      KostCycle<span className="brand-dot">.</span>
    </Link>
  );
}
export default function Header() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sectionLink = (pattern) => ({
    className: pattern.test(pathname) ? "active" : undefined,
    "aria-current": pattern.test(pathname) ? "page" : undefined,
  });
  return (
    <>
      <div className="announcement">
        <span>GOOD FINDS. SHORT WALKS. LESS WASTE.</span>
        <span>
          A little more circular, a little closer to home{" "}
          <ArrowUpRight size={13} />
        </span>
      </div>
      <header className="header">
        <div className="header-main container">
          <Wordmark />
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/browse?q=${encodeURIComponent(query)}`);
              setMenu(false);
            }}
          >
            <Search size={20} />
            <input
              aria-label="Search marketplace"
              placeholder="Search fans, lamps, storage..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button aria-label="Search" type="submit">
              <ArrowUpRight size={20} />
            </button>
          </form>
          <Link
            className="header-saved icon-button"
            to="/browse?saved=1"
            aria-label="Saved items"
          >
            <Heart size={22} />
          </Link>
          <Link
            className="profile-link"
            to={state.currentUser ? "/profile" : "/login"}
            aria-label="My Profile"
          >
            <span className="avatar small">
              {state.currentUser ? (
                state.currentUser.name[0]
              ) : (
                <UserRound size={17} />
              )}
            </span>
            <span>
              {state.currentUser
                ? state.currentUser.name.split(" ")[0]
                : "Join the cycle"}
            </span>
          </Link>
          <button
            className="menu-toggle icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
            aria-expanded={menu}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
        <div className={`header-lower container ${menu ? "menu-open" : ""}`}>
          <div className="location-label">
            <MapPin size={15} />
            <strong>{state.currentUser?.residence || "Alam Sutera"}</strong>
            <span>· {state.currentUser?.campus || "BINUS Alam Sutera"}</span>
          </div>
          <nav aria-label="Main navigation" onClick={() => setMenu(false)}>
            <NavLink to="/" end>
              Home
            </NavLink>
            <Link to="/browse" {...sectionLink(/^\/(browse|item)(\/|$)/)}>
              Browse
            </Link>
            <Link
              to="/activity"
              {...sectionLink(/^\/(activity|reservation)(\/|$)/)}
            >
              My Activity
            </Link>
            <NavLink to="/impact">Your Impact</NavLink>
            <Link
              to="/profile"
              {...sectionLink(/^\/(profile|admin|login)(\/|$)/)}
            >
              Profile
            </Link>
            <NavLink to="/sell" className="sell-link">
              <Plus size={16} /> Sell / Give away
            </NavLink>
          </nav>
        </div>
      </header>
    </>
  );
}
export function BottomNav() {
  const { pathname } = useLocation();
  const area = pathname.startsWith("/item")
    ? "/browse"
    : pathname.startsWith("/reservation")
      ? "/activity"
      : /^\/(profile|login|impact|admin)/.test(pathname)
        ? "/profile"
        : pathname.startsWith("/sell")
          ? "/sell"
          : pathname;
  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {[
        ["/", "Home", House],
        ["/browse", "Browse", Search],
        ["/sell", "Sell", Plus],
        ["/activity", "Activity", ClipboardList],
        ["/profile", "Profile", UserRound],
      ].map(([to, label, Icon]) => (
        <Link
          key={to}
          to={to}
          className={area === to ? "active" : ""}
          aria-current={area === to ? "page" : undefined}
        >
          <Icon size={21} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
export function Footer() {
  return (
    <footer className="footer container">
      <Wordmark />
      <p>Good things deserve another home.</p>
      <span>
        Made for the neighbourhood.
        <br />
        BINUS · Alam Sutera
      </span>
    </footer>
  );
}
