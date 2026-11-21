import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
export default function BackButton({ fallback = "/browse" }) {
  const navigate = useNavigate();
  return (
    <button
      className="back-link"
      type="button"
      onClick={() => {
        // React Router's index counts only entries in this app, not external history.
        if (window.history.state?.idx > 0) navigate(-1);
        else navigate(fallback, { replace: true });
      }}
    >
      <ArrowLeft size={17} />
      Back
    </button>
  );
}
