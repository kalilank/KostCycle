import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  CalendarCheck,
  Footprints,
  Repeat2,
  Plus,
} from "lucide-react";
import { useApp } from "../context/store";
import { categories } from "../data/catalog";
import { ProductGrid, ProductImage } from "../components/UI";
import { categoryIcons } from "../components/categoryIcons";
import Recommendations from "../components/Recommendations";

export default function Home() {
  const { state } = useApp();
  const nearby = state.listings
    .filter((i) => i.status === "AVAILABLE" && !i.archived_at)
    .sort((a, b) => a.distance - b.distance);
  const heroItem = nearby[0] || {
    name: "Illustrative desk lamp",
    category: "Lamps",
    imageIndex: 0,
  };
  return (
    <div className="home container">
      {!state.currentUser && (
        <div className="entry-banner">
          <span>Buy, sell or give away nearby.</span>
          <Link to="/login">
            Sign in / Join the cycle <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-square" /> THE STUDENT-TO-STUDENT MARKETPLACE
          </span>
          <h1>
            Good stuff shouldn’t
            <br />
            move to the{" "}
            <span className="trash-word">
              trash
              <svg
                viewBox="0 0 200 20"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M0 14 Q100 1 200 8" />
              </svg>
            </span>
            .
          </h1>
          <p>Find affordable kost essentials from students nearby.</p>
          <div className="button-row">
            <Link className="button primary" to="/browse">
              Browse nearby <ArrowUpRight size={19} />
            </Link>
            <Link className="button secondary" to="/sell">
              <Plus size={17} /> List an item
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          {heroItem && <ProductImage item={heroItem} />}
          <div className="circular-note">
            <Repeat2 size={25} />
            <span>
              PRE-LOVED.
              <br />
              RE-READY.
            </span>
          </div>
          <div className="hero-product-note">
            <span>A new chapter for your essentials.</span>
            <ArrowUpRight size={22} />
          </div>
        </div>
      </section>
      <ol className="how-it-works" aria-label="How KostCycle works">
        <li>
          <Search size={21} />
          <span>Find nearby</span>
        </li>
        <li>
          <CalendarCheck size={21} />
          <span>Reserve</span>
        </li>
        <li>
          <Footprints size={21} />
          <span>Pick up</span>
        </li>
      </ol>
      <Recommendations />
      <section className="category-section">
        <div className="section-heading">
          <h2>What does your room need?</h2>
          <Link to="/browse">
            Browse everything <ArrowRight size={16} />
          </Link>
        </div>
        <div className="categories">
          {categories.map((category) => {
            const Icon = categoryIcons[category];
            return (
              <Link
                key={category}
                to={`/browse?category=${encodeURIComponent(category)}`}
              >
                <Icon size={27} strokeWidth={1.4} />
                <span>{category}</span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="nearby-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow muted">GOOD FINDS, CLOSE TO HOME</span>
            <h2>
              Near your kost<span className="yellow-dot">.</span>
            </h2>
          </div>
          <Link to="/browse">
            See all nearby <ArrowRight size={17} />
          </Link>
        </div>
        <ProductGrid items={nearby.slice(0, 4)} />
      </section>
      <section className="free-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              ZERO RUPIAH. PLENTY OF POSSIBILITIES.
            </span>
            <h2>Free to a good room.</h2>
          </div>
          <Link to="/browse?price=free">
            See all free finds <ArrowRight size={17} />
          </Link>
        </div>
        <ProductGrid items={nearby.filter((i) => i.price === 0).slice(0, 4)} />
      </section>
      <section className="closing-banner">
        <Repeat2 size={38} strokeWidth={1.5} />
        <div>
          <h2>Moving out? Leave a little good behind.</h2>
          <p>Give your useful things their next chapter.</p>
        </div>
        <Link className="button secondary" to="/sell">
          List your first item <ArrowUpRight size={18} />
        </Link>
      </section>
    </div>
  );
}
