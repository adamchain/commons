import { Link, useNavigate, useParams } from "react-router-dom";
import { LegalContent } from "../components/LegalContent";
import { LEGAL_DOCS } from "../content/legal";

/**
 * Public, in-app reader for the Terms of Service and Privacy Policy
 * (`/legal/terms`, `/legal/privacy`). Linked from the marketing landing and
 * Settings. No auth required.
 */
export function LegalPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const doc = slug === "terms" || slug === "privacy" ? LEGAL_DOCS[slug] : null;

  // Reachable from the landing, Settings, or a deep link — step back through
  // history when we can, otherwise fall back to the marketing landing.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/welcome");
  };

  if (!doc) {
    return (
      <div className="legal-page">
        <button type="button" className="legal-page-back" onClick={goBack}>
          ← Back
        </button>
        <p>That document doesn’t exist.</p>
      </div>
    );
  }

  return (
    <div className="legal-page">
      <button type="button" className="legal-page-back" onClick={goBack}>
        ← Back
      </button>
      <div className="legal-page-tabs">
        <Link
          to="/legal/terms"
          className={`legal-page-tab ${slug === "terms" ? "is-active" : ""}`}
        >
          Terms of Service
        </Link>
        <Link
          to="/legal/privacy"
          className={`legal-page-tab ${slug === "privacy" ? "is-active" : ""}`}
        >
          Privacy Policy
        </Link>
      </div>
      <LegalContent doc={doc} />
    </div>
  );
}
