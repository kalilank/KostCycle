import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
            to={state.currentUser ? "/activity" : "/login"}
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
            <NavLink to="/browse">Browse</NavLink>
            <NavLink to="/activity">My Activity</NavLink>
            <NavLink to="/impact">Your Impact</NavLink>
            <NavLink to="/sell" className="sell-link">
              <Plus size={16} /> Sell / Give away
            </NavLink>
          </nav>
        </div>
      </header>
    </>
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
