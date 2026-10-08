// Shared wording and small lookup tables used by the website and the extension's side panel.
// Keeping them here means a sentence is changed once and both surfaces stay identical.
// Rules these strings must follow (docs/spec/04_Design_Brief_UI_UX.md): plain language, risk
// never described as "safe", missing data described as unknown (not suspicious).
import type { IconName } from "./components/Icon";
import type { FeedbackVerdict, PipelineStage, RiskBand, SignalName } from "./types";

/** The five processing stages in the order they run, with buyer-readable labels. */
export const STAGES: ReadonlyArray<{ key: PipelineStage; label: string }> = [
  { key: "visual", label: "Checking photos" },
  { key: "textual", label: "Checking listing wording" },
  { key: "behavioural", label: "Checking visible seller details" },
  { key: "fusion", label: "Combining available signals" },
  { key: "explanation", label: "Preparing plain-language reasons" },
];

/**
 * Icon and one-line meaning per band. The icon SHAPE differs for every band (tick circle, alert
 * triangle, alert octagon) so colour is never the only difference. "Low" deliberately says "no
 * strong warning signs", never "safe".
 */
export const BAND_COPY: Record<RiskBand, { icon: IconName; meaning: string }> = {
  low: {
    icon: "tick-circle",
    meaning: "No strong warning signs found by this check",
  },
  moderate: {
    icon: "alert-triangle",
    meaning: "Some warning signs need closer checking",
  },
  high: {
    icon: "alert-octagon",
    meaning: "Several warning signs need serious attention",
  },
};

/** Display names of the three signals. */
export const SIGNAL_NAMES: Record<SignalName, string> = {
  visual: "Visual",
  textual: "Textual",
  behavioural: "Behavioural",
};

/** Small neutral icons for the three signals (image, text lines, person with clock). */
export const SIGNAL_ICONS: Record<SignalName, IconName> = {
  visual: "image",
  textual: "text-lines",
  behavioural: "person-clock",
};

/** Shown after the processing screen has waited a while. No percentages, no fake progress. */
export const SLOW_WAIT_COPY =
  "This is taking longer than usual. The current stage is still running.";

/** Shown under the category field when the text is not one of the 12 trained categories. */
export const UNSEEN_CATEGORY_NOTE =
  "Price is compared with the overall average, not this category's average.";

/** The fixed sentence for any signal that could not be computed. */
export const UNAVAILABLE_SIGNAL_SENTENCE =
  "Not enough information. Treated as unknown, not as suspicious.";

/** Retention statement shown beside every submit control (wording pends the approved retention period). */
export const RETENTION_NOTICE =
  "Raw uploaded text is scrubbed before storage. The exact retention period remains an open supervisor item and must be filled before the user study.";

/** Warning shown while scores come from development stubs rather than trained models. */
export const DEV_STUB_NOTICE =
  "Development stub. These scores are interface test data, not trained model results.";

/** The question asked after a result, on the website and in the browser extension alike. */
export const FEEDBACK_HEADING = "Was this result helpful?";

/**
 * The three feedback choices, in the order they are shown: the value sent to the API and the label
 * on screen. Both surfaces render these, so the wording cannot drift apart.
 */
export const FEEDBACK_OPTIONS: ReadonlyArray<readonly [FeedbackVerdict, string]> = [
  ["helpful", "Helpful"],
  ["unclear", "Unclear"],
  ["potentially_incorrect", "Potentially incorrect"],
];
