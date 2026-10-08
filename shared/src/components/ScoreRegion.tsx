// The score region: score, band chip, and disclaimer as ONE bounded region, so the caveat is
// read as part of the verdict (Design Brief: Common Region and Selective Attention rules).
import { BandChip } from "./BandChip";
import type { RiskBand } from "../types";

/** Props of the score region: the numeric score, its band, and the disclaimer shown with it. */
export interface ScoreRegionProps {
  /** The risk score. Rounded to an integer for display; decimals are never shown. */
  score: number;
  band: RiskBand;
  /** Must be shown wherever a score is shown, so it is a required part of this component. */
  disclaimer: string;
}

/** Renders the score, its band, and the disclaimer inside one labelled region. */
export function ScoreRegion({ score, band, disclaimer }: ScoreRegionProps) {
  const shown = Math.round(score);
  return (
    <section className="score-region" aria-label={`Risk score ${shown} out of 100, ${band}`}>
      <div className="score-number">{shown}</div>
      <div className="score-total">out of 100</div>
      <BandChip band={band} />
      <p className="disclaimer">{disclaimer}</p>
    </section>
  );
}
