import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Fan,
  LampDesk,
  Archive,
  Armchair,
  CookingPot,
  UtensilsCrossed,
  Headphones,
  Cable,
  GraduationCap,
  BedDouble,
  Compass,
  Check,
  ArrowLeft,
  ArrowRight,
  Search,
} from "lucide-react";
import { useApp } from "../context/store";
import {
  INTERESTS,
  BUDGETS,
  SPECIFIC_SUGGESTIONS,
  SPECIFIC_MAX,
  feedLink,
} from "../utils/interests";

const icons = {
  cooling: Fan,
  lighting: LampDesk,
  storage: Archive,
  furniture: Armchair,
  appliances: CookingPot,
  tableware: UtensilsCrossed,
  gadgets: Headphones,
  cables: Cable,
  study: GraduationCap,
  decor: BedDouble,
  browsing: Compass,
};
const STEPS = [
  {
    title: "What are you hunting for?",
    text: "Pick as many as you like. We'll put these at the top of your feed.",
  },
  {
    title: "Looking for something specific?",
    text: "Optional. Type an item or tap a suggestion.",
  },
  {
    title: "What's your budget?",
    text: "We'll favour finds in this range. You can still see everything.",
  },
];

export default function Onboarding() {
  const { interests, setInterests, notify } = useApp();
  const navigate = useNavigate();
  const start = interests && !interests.skipped ? interests : null;
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(() => start?.interests || []);
  const [specific, setSpecific] = useState(() => start?.specific || "");
  const [budget, setBudget] = useState(() => start?.budget || "any");

  function toggle(id) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      // "Just browsing" is exclusive with the concrete interests.
      if (id === "browsing") return ["browsing"];
      return [...current.filter((x) => x !== "browsing"), id];
    });
  }
  function skip() {
    setInterests?.({ skipped: true });
    notify?.("No problem. You can personalise later from your profile.");
    navigate("/browse");
  }
  function finish() {
    const saved = setInterests?.({ interests: picked, specific, budget });
    notify?.("Your feed is ready.");
    navigate(saved ? feedLink(saved) : "/browse");
  }
  const canContinue = step !== 0 || picked.length > 0;
  const { title, text } = STEPS[step];

  return (
    <div className="container page onboarding-page">
      <div className="onboarding-top">
        <div
          className="onboarding-dots"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
        >
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={index <= step ? "done" : ""}
              aria-hidden="true"
            />
          ))}
        </div>
        <button type="button" className="text-link" onClick={skip}>
          Skip
        </button>
      </div>

      <span className="eyebrow muted">
        STEP {step + 1} OF {STEPS.length}
      </span>
      <h1 className="onboarding-title">{title}</h1>
      <p className="onboarding-text muted">{text}</p>

      {step === 0 && (
        <div className="interest-grid">
          {INTERESTS.map((interest) => {
            const Icon = icons[interest.id];
            const on = picked.includes(interest.id);
            return (
              <button
                type="button"
                key={interest.id}
                className={`interest-tile${on ? " selected" : ""}`}
                aria-pressed={on}
                onClick={() => toggle(interest.id)}
              >
                <span className="interest-icon">
                  <Icon size={24} />
                </span>
                <span className="interest-label">{interest.label}</span>
                <span className="interest-hint">{interest.hint}</span>
                {on && (
                  <span className="interest-check" aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {step === 1 && (
        <div className="onboarding-specific">
          <label className="browse-search">
            <Search size={19} />
            <input
              aria-label="A specific item you're looking for"
              placeholder="e.g. mini fridge, hangers, kettle"
              maxLength={SPECIFIC_MAX}
              value={specific}
              onChange={(event) => setSpecific(event.target.value)}
            />
          </label>
          <p className="small muted">
            {specific.length}/{SPECIFIC_MAX}
          </p>
          <div className="onboarding-chips">
            {SPECIFIC_SUGGESTIONS.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                className={`filter-chip${
                  specific.toLowerCase() === suggestion ? " selected" : ""
                }`}
                aria-pressed={specific.toLowerCase() === suggestion}
                onClick={() => setSpecific(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="budget-list" role="radiogroup" aria-label="Budget">
          {BUDGETS.map((option) => (
            <button
              type="button"
              role="radio"
              key={option.id}
              aria-checked={budget === option.id}
              className={`interest-tile budget-tile${
                budget === option.id ? " selected" : ""
              }`}
              onClick={() => setBudget(option.id)}
            >
              <span className="interest-label">{option.label}</span>
              {budget === option.id && (
                <span className="interest-check" aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="onboarding-actions">
        {step > 0 ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={18} /> Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="button primary"
            disabled={!canContinue}
            onClick={() => setStep(step + 1)}
          >
            Next <ArrowRight size={18} />
          </button>
        ) : (
          <button type="button" className="button primary" onClick={finish}>
            Show my feed <ArrowRight size={18} />
          </button>
        )}
      </div>
      {step === 0 && !canContinue && (
        <p className="small muted onboarding-note">
          Pick at least one to continue, or tap Skip.
        </p>
      )}
    </div>
  );
}
