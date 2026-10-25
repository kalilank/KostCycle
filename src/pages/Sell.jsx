import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, ImagePlus, Camera, MapPin } from "lucide-react";
import { categories, residences, periods } from "../data/catalog";
import { useApp } from "../context/store";
import { ProductImage } from "../components/UI";
import BackButton from "../components/BackButton";

export default function Sell() {
  const { state, dispatch, notify } = useApp();
  const navigate = useNavigate();
  const { id } = useParams();
  const existing = state.listings.find((item) => item.id === id);
  const [form, setForm] = useState(
    existing || {
      name: "",
      category: "Lamps",
      condition: "Good",
      price: "",
      residence: state.currentUser.residence,
      description: "",
      pickup: ["Today"],
      imageIndex: 0,
    },
  );
  const [free, setFree] = useState(existing?.price === 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  function update(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1200000
    ) {
      setError(
        "Choose a JPG, PNG, or WebP photo smaller than 1.2 MB, or leave the photo empty.",
      );
      event.target.value = "";
      return;
    }
    setBusy(true);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      update("image", reader.result);
      setBusy(false);
    };
    reader.onerror = () => {
      setError("That photo could not be read. Try another image.");
      setBusy(false);
    };
    reader.readAsDataURL(file);
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || submitting) return;
    if (!form.pickup.length) {
      setError("Choose at least one pickup period.");
      return;
    }
    try {
      setSubmitting(true);
      const next = await dispatch({
        type: id ? "update" : "create",
        id,
        listing: {
          ...form,
          price: free ? 0 : Number(form.price),
          distance: [150, 380, 620, 800, 950][
            residences.indexOf(form.residence)
          ],
        },
      });
      notify(
        id ? "Listing updated." : "Your item is listed. Give it another home!",
      );
      navigate(`/item/${next.listing.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }
  if (
    id &&
    (!existing ||
      existing.sellerId !== state.currentUser.id ||
      existing.status !== "AVAILABLE" ||
      existing.archived_at)
  )
    return (
      <div className="container page">
        <h1>Listing cannot be edited.</h1>
        <p>Only your available listings can be edited.</p>
      </div>
    );
  return (
    <div className="container page sell-page">
      <BackButton fallback="/activity" />
      <div className="page-heading">
        <span className="eyebrow muted">LESS CLUTTER. MORE POSSIBILITIES.</span>
        <h1>{id ? "Edit listing" : "Sell / Give Away"}</h1>
      </div>
      <form className="sell-layout" onSubmit={submit}>
        <div className="form-main">
          <section className="form-section">
            <div className="form-section-heading">
              <span>01</span>
              <h2>The good stuff</h2>
            </div>
            <label className="field">
              Item name
              <input
                required
                maxLength={80}
                placeholder="e.g. Black desk lamp"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <div className="two-fields">
              <label className="field">
                Category
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Condition
                <select
                  value={form.condition}
                  onChange={(e) => update("condition", e.target.value)}
                >
                  {["Like New", "Good", "Fair"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Description
              <textarea
                required
                rows={4}
                maxLength={1500}
                placeholder="e.g. 60 cm wide, small scratch on the side."
                aria-describedby="description-help"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
              <span id="description-help" className="small muted">
                Mention size, condition, defects, or anything the next owner
                should know.
              </span>
            </label>
          </section>
          <section className="form-section">
            <div className="form-section-heading">
              <span>02</span>
              <h2>Name your price</h2>
            </div>
            <div className="segmented">
              <button
                type="button"
                className={!free ? "selected" : ""}
                aria-pressed={!free}
                onClick={() => setFree(false)}
              >
                Sell
              </button>
              <button
                type="button"
                className={free ? "selected" : ""}
                aria-pressed={free}
                onClick={() => setFree(true)}
              >
                Give Away
              </button>
            </div>
            {free ? (
              <div className="free-message">
                <strong>FREE</strong>
                <span>A small kindness goes a long way.</span>
              </div>
            ) : (
              <label className="field">
                Price (Rp)
                <input
                  required
                  type="number"
                  min="1"
                  max="100000000"
                  step="1"
                  placeholder="35,000"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                />
              </label>
            )}
          </section>
          <section className="form-section">
            <div className="form-section-heading">
              <span>03</span>
              <h2>A place to meet</h2>
            </div>
            <label className="field">
              Residence
              <select
                value={form.residence}
                onChange={(e) => update("residence", e.target.value)}
              >
                {residences.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <p className="small muted">
              <MapPin size={14} /> Meet in the residence lobby or a shared
              public area.
            </p>
            <fieldset className="pickup-options">
              <legend>Pickup availability</legend>
              {periods.map((period) => (
                <label
                  key={period}
                  className={form.pickup.includes(period) ? "chosen" : ""}
                >
                  <input
                    type="checkbox"
                    checked={form.pickup.includes(period)}
                    onChange={(e) =>
                      update(
                        "pickup",
                        e.target.checked
                          ? [...form.pickup, period]
                          : form.pickup.filter((p) => p !== period),
                      )
                    }
                  />
                  {period}
                </label>
              ))}
            </fieldset>
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy || submitting} className="button primary full">
            {submitting
              ? "Saving…"
              : busy
                ? "Reading photo…"
                : id
                  ? "Save changes"
                  : "List item"}
            <ArrowRight size={18} />
          </button>
          <p className="small muted">
            Your listing will be visible in the shared marketplace.
          </p>
        </div>
        <aside className="photo-section">
          <h2>
            <Camera size={21} /> Photo (optional)
          </h2>
          <ProductImage
            item={{ ...form, name: form.name || "Listing photo preview" }}
          />
          <label className="button secondary full upload-label">
            <ImagePlus size={18} /> Upload a photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={upload}
            />
          </label>
          <p className="small muted">
            JPG, PNG or WebP · up to 1.2 MB
            <br />
            No photo? We’ll use a labelled illustrative photo.
          </p>
          {form.image && (
            <button
              type="button"
              className="text-link"
              onClick={() => update("image", null)}
            >
              Remove photo
            </button>
          )}
        </aside>
      </form>
    </div>
  );
}
