// Explanation page: the depth behind a result, grouped by signal, plus the full list of manual
// checks. The browser extension's side panel links here ("See full explanation"), optionally to
// one signal's section (#visual, #textual, #behavioural).
//
// Like the result page it first completes any extension handoff in the URL, then loads the result.
// Because the content loads after the page opens, the browser's own jump to "#visual" would find
// nothing; the second effect scrolls to that section once the content is on screen.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DevBanner } from "@guardianlens/shared";
import { apiFetch } from "@/lib/api";
import type { AssessmentResult } from "@/lib/types";
import { useSessionClaim } from "@/lib/useSessionClaim";

// Section headings, one per signal.
const labels = {
  visual: "Visual signal",
  textual: "Textual signal",
  behavioural: "Behavioural signal",
};

/** Renders the explanation: one section per signal, then the manual checks and the disclaimer. */
export default function ExplanationPage() {
  const params = useParams<{ id: string }>();
  const claimed = useSessionClaim();
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the result once any session handoff has finished.
  useEffect(() => {
    if (!claimed) return;
    apiFetch<AssessmentResult>(`/api/v1/assess/${params.id}/result`)
      .then(setResult)
      .catch(() => setLoadError("The explanation could not be loaded for this browser session."));
  }, [params.id, claimed]);

  // Scroll to the section named in the address (for example #visual) once the content exists.
  useEffect(() => {
    if (!result) return;
    const target = window.location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView();
  }, [result]);

  if (loadError)
    return (
      <main className="page">
        <p className="error-text">{loadError}</p>
      </main>
    );
  if (!result)
    return (
      <main className="page">
        <div className="loading">Loading explanation…</div>
      </main>
    );

  return (
    <main className="page">
      {result.development_stub && <DevBanner />}
      <p className="eyebrow">Explanation details</p>
      <h1 className="page-title">Why this result was shown</h1>
      <p className="page-lead">Reasons are grouped by signal. Missing fields stay unknown.</p>

      {result.signal_cards.map((card) => (
        <section className="card explanation-section" id={card.signal} key={card.signal}>
          <h2>{labels[card.signal]}</h2>
          <p>
            <strong className="status-word">{card.status_word}</strong>. {card.summary}
          </p>
          {card.reasons.length > 0 ? (
            <ul className="reason-list">
              {card.reasons.map((reason) => (
                <li
                  className={`reason reason-${reason.direction}`}
                  key={`${reason.feature_key}-${reason.rank}`}
                >
                  {reason.display_text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">No detailed reason is available for this signal.</p>
          )}
          {card.scope_note && <p className="scope-note">{card.scope_note}</p>}
        </section>
      ))}

      {/* Same card spacing as the signal sections above, so "Back to result" does not touch it. */}
      <section className="card explanation-section">
        <h2>Manual checks</h2>
        <ol className="check-list">
          {result.suggested_checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ol>
        <p className="disclaimer">{result.disclaimer}</p>
      </section>

      <Link className="button button-secondary button-full" href={`/assess/${params.id}`}>
        Back to result
      </Link>
    </main>
  );
}
