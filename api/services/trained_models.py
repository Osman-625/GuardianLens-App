"""Serve exported training artifacts; never refit or substitute development scores."""

from __future__ import annotations

import hashlib
import importlib
import json
import math
import sys
import threading
from pathlib import Path
from typing import Any, Literal

from api.models.domain import AssessmentRecord
from api.schemas import RiskBand, SignalName, SignalReason
from api.services.pipelines import SignalOutput
from api.settings import Settings

# The files a trained run folder must contain: its metadata, the three signal models (text T,
# behaviour B, visual V), and the saved fusion model.
ARTIFACTS = ("run.json", "models/T.joblib", "models/B.joblib", "models/V.joblib", "fusion.joblib")


def missing_artifacts(run_dir: Path) -> list[str]:
    """Lists the required files that are absent from a trained run folder (empty when complete)."""
    return [name for name in ARTIFACTS if not (run_dir / name).is_file()]


def _probability(value: Any) -> float:
    """Converts a model output to a float and rejects anything that is not a probability."""
    p = float(value)
    if not math.isfinite(p) or not 0 <= p <= 1:
        raise ValueError("The trained model returned an invalid probability.")
    return p


class TrainedModels:
    """The saved models of one trained run, loaded once and used to score assessments.

    It holds the text (T), behavioural (B) and visual (V) signal models and the fusion model, and
    turns each signal's output into a probability, plain-language reasons, and a card.
    """

    def __init__(self, settings: Settings) -> None:
        """Loads and cross-checks the saved run; raises at start-up if anything is wrong.

        The checks cover the run folder's files, the training workspace that defines the saved
        classes, the type of each model, the agreement between run.json and the fusion model's
        risk boundaries, and (when present) the training diagnostics. The visual engine is
        optional: if its assets are missing the visual signal is reported as unavailable.
        """
        if settings.guardianlens_model_run_dir is None:
            raise RuntimeError("No trained model run is configured.")
        self.run_dir = settings.guardianlens_model_run_dir.resolve()
        missing = missing_artifacts(self.run_dir)
        if missing:
            raise RuntimeError(f"Model run is incomplete: {', '.join(missing)}")
        self.workspace = settings.guardianlens_training_workspace.resolve()
        if not (self.workspace / "gl" / "models.py").is_file():
            raise RuntimeError("The GuardianLens training workspace is missing.")
        # Saved artifacts reference their original gl.models / gl.fusion classes.
        if str(self.workspace) not in sys.path:
            sys.path.insert(0, str(self.workspace))
        joblib = importlib.import_module("joblib")

        self.meta = json.loads((self.run_dir / "run.json").read_text(encoding="utf-8"))
        self.label = self.meta["run_id"]
        self.cfg = self.meta["config"]
        if self.cfg["signals"]["textual"].get("impl") != "cues":
            raise RuntimeError("This adapter requires the TF-IDF plus text-cues T model.")
        self.text = joblib.load(self.run_dir / "models" / "T.joblib")
        self.behaviour = joblib.load(self.run_dir / "models" / "B.joblib")
        self.visual = joblib.load(self.run_dir / "models" / "V.joblib")
        self.fusion = joblib.load(self.run_dir / "fusion.joblib")
        if type(self.text).__name__ != "TextCueSignal":
            raise RuntimeError(
                "T.joblib does not contain the expected TF-IDF plus text-cues model."
            )
        if type(self.behaviour).__name__ != "BehaviouralSignal":
            raise RuntimeError("B.joblib does not contain the expected XGBoost behavioural model.")
        if type(self.visual).__name__ != "VisualSignal":
            raise RuntimeError("V.joblib does not contain the expected visual classifier.")
        self.bands = self.fusion["bands"]
        if self.meta.get("bands") != self.bands:
            raise RuntimeError("The saved fusion boundaries do not match run.json.")
        diagnostics_path = self.run_dir / "train_diagnostics.json"
        if diagnostics_path.is_file():
            diagnostics = json.loads(diagnostics_path.read_text(encoding="utf-8"))
            for key, model in (("T", self.text), ("B", self.behaviour), ("V", self.visual)):
                if diagnostics[key]["params"] != model.params:
                    raise RuntimeError(f"{key}.joblib parameters do not match the selected run.")
        low, high = self.bands["low_moderate"], self.bands["moderate_high"]
        if not 0 <= low < high <= 1:
            raise RuntimeError("The saved fusion risk thresholds are invalid.")
        if self.fusion["core"] != ["V", "T", "B"]:
            raise RuntimeError("The model run must contain V, T and B fusion inputs.")
        self.lock = threading.Lock()
        self.visual_engine: Any = None
        self.visual_unavailable: str | None = None
        try:
            from api.services.trained_visual import TrainedVisual

            self.visual_engine = TrainedVisual(self.workspace, self.cfg, self.meta)
        except (FileNotFoundError, ImportError) as exc:
            self.visual_unavailable = str(exc)

    def frame(self, assessment: AssessmentRecord) -> Any:
        """Builds the one-row table of inputs that the text and behavioural models read."""
        pd = importlib.import_module("pandas")

        return pd.DataFrame(
            [
                {
                    "listing_id": str(assessment.id),
                    "group_id": str(assessment.id),
                    "title": assessment.title_for_inference,
                    "description": assessment.description_for_inference,
                    "price": assessment.price,
                    "category": assessment.category,
                    "seller_rating": assessment.seller.rating,
                    "account_age_days": assessment.seller.account_age_days,
                    "review_count": assessment.seller.review_count,
                    "active_listing_count": assessment.seller.active_listing_count,
                }
            ]
        )

    def run_textual(self, assessment: AssessmentRecord) -> SignalOutput:
        """Scores the listing text with the TF-IDF plus text-cues model.

        The reasons are the three words whose features move the score most.
        """
        import numpy as np

        frame = self.frame(assessment)
        with self.lock:
            p = _probability(self.text.predict(frame)[0])
            X = self.text._X(frame)
            effects = X.multiply(self.text.model.coef_[0]).toarray()[0]
            names = self.text.word.get_feature_names_out()
        # Explain actual word feature contributions, avoiding fragments from character ngrams.
        order = np.argsort(np.abs(effects[: len(names)]))[::-1]
        reasons: list[SignalReason] = []
        for i in order:
            if abs(effects[i]) < 1e-8:
                continue
            direction: Literal["raises", "lowers"] = "raises" if effects[i] > 0 else "lowers"
            reasons.append(
                SignalReason(
                    feature_key=f"tfidf_word_{i}",
                    direction=direction,
                    display_text=f'The wording "{names[i]}" {direction} the text model score.',
                    rank=len(reasons) + 1,
                )
            )
            if len(reasons) == 3:
                break
        return SignalOutput(
            signal=SignalName.TEXTUAL,
            probability=p,
            available=True,
            status_word="model check",
            summary=(
                "Analysed using trained TF-IDF word and character features, "
                "text cues, and logistic regression."
            ),
            reasons=reasons,
            scope_note=(
                "Shown phrases are word-feature contributions; "
                "text cues and character features also affect the score."
            ),
        )

    def run_behavioural(self, assessment: AssessmentRecord) -> SignalOutput:
        """Scores the price and seller details with the XGBoost behavioural model.

        The reasons are the three seller or price features that move the score most; a missing
        seller field is never named as a reason, and the card says how many were unknown.
        """
        frame = self.frame(assessment)
        with self.lock:
            p = _probability(self.behaviour.predict(frame)[0])
            effects = self.behaviour.shap_values(frame).iloc[0].drop("_base")
        names = {
            "price": "The listing price",
            "price_ratio_category": "The price compared with training listings in this category",
            "account_age_days": "The account age",
            "seller_rating": "The seller rating",
            "review_count": "The review count",
            "active_listing_count": "The active listing count",
        }
        reasons: list[SignalReason] = []
        for key in effects.abs().sort_values(ascending=False).index:
            if (
                key.endswith("_missing")
                or key not in names
                or (key in frame and frame[key].isna().iloc[0])
            ):
                continue
            if abs(float(effects[key])) < 1e-8:
                continue
            direction: Literal["raises", "lowers"] = "raises" if effects[key] > 0 else "lowers"
            reasons.append(
                SignalReason(
                    feature_key=key,
                    direction=direction,
                    display_text=f"{names[key]} {direction} the behavioural model score.",
                    rank=len(reasons) + 1,
                )
            )
            if len(reasons) == 3:
                break
        missing = sum(assessment.seller.missing_flags().values())
        return SignalOutput(
            signal=SignalName.BEHAVIOURAL,
            probability=p,
            available=True,
            status_word="model check",
            summary="Analysed using the trained XGBoost behavioural model.",
            reasons=reasons,
            scope_note=(
                f"{missing} seller fields are unknown. "
                "The trained model uses missingness flags; no seller values were invented."
                if missing
                else None
            ),
        )

    def run_visual(self, assessment: AssessmentRecord) -> SignalOutput:
        """Scores the photos with CLIP, SSCD reference matching, and the visual classifier.

        When the visual assets are not available the signal is reported as unavailable (never a
        stand-in score), and the fusion model receives it as missing.
        """
        if self.visual_engine is None:
            return SignalOutput(
                signal=SignalName.VISUAL,
                probability=None,
                available=False,
                status_word="limited information",
                summary=(
                    "Visual scoring is unavailable because the CLIP/SSCD assets "
                    "or approved reference embeddings are missing."
                ),
                scope_note=(
                    "The fusion model receives a missing visual signal, "
                    "not a development test score."
                ),
            )
        with self.lock:
            table = self.visual_engine.features(assessment)
            X = table[self.visual.cols].astype(float).fillna(0).to_numpy()
            p = _probability(self.visual.model.predict_proba(self.visual.scaler.transform(X))[0, 1])
            effects = self.visual.scaler.transform(X)[0] * self.visual.model.coef_[0]
        names = {
            "clip_title_mean": "Photo and title consistency",
            "clip_title_min": "The least consistent photo and title",
            "clip_title_max": "The most consistent photo and title",
            "clip_category_mean": "Photo and category consistency",
            "clip_title_minus_category": "Photo consistency with the title versus category",
            "sscd_max": "The closest reference-image similarity",
            "sscd_mean_max": "Average reference-image similarity",
            "sscd_frac_match": "The proportion of photos similar to reference images",
            "n_images": "The number of uploaded photos",
        }
        ranked = sorted(
            zip(self.visual.cols, effects, strict=True), key=lambda pair: -abs(pair[1])
        )[:3]
        reasons = [
            SignalReason(
                feature_key=key,
                direction="raises" if effect > 0 else "lowers",
                display_text=(
                    f"{names.get(key, key)} "
                    f"{'raises' if effect > 0 else 'lowers'} the visual model score."
                ),
                rank=i,
            )
            for i, (key, effect) in enumerate(ranked, 1)
            if abs(effect) > 1e-8
        ]
        return SignalOutput(
            signal=SignalName.VISUAL,
            probability=p,
            available=True,
            status_word="model check",
            summary=(
                "Analysed using CLIP, SSCD reference-image matching, "
                "and the trained visual classifier."
            ),
            reasons=reasons,
            scope_note="Image similarity is limited to the approved training reference corpus.",
        )

    def fuse(self, outputs: list[SignalOutput]) -> tuple[int, RiskBand]:
        """Combines the three signals with the saved fusion model.

        An unavailable signal is passed on as missing. The band is chosen from the unrounded
        probability using the run's saved boundaries; the score is that probability as a
        percentage, rounded.
        """
        import numpy as np

        keys = {SignalName.VISUAL: "V", SignalName.TEXTUAL: "T", SignalName.BEHAVIOURAL: "B"}
        P = {keys[o.signal]: np.array([o.probability if o.available else np.nan]) for o in outputs}
        with self.lock:
            p = _probability(self.fusion["fusions"][self.fusion["full"]].predict(P)[0])
        band = (
            RiskBand.HIGH
            if p >= self.bands["moderate_high"]
            else RiskBand.MODERATE
            if p >= self.bands["low_moderate"]
            else RiskBand.LOW
        )
        return round(p * 100), band


def verify_train_split(workspace: Path, meta: dict[str, Any]) -> Path:
    """Returns the training reference split after checking its hash against the run's record.

    Raises FileNotFoundError when the file is missing and RuntimeError when it is not the file
    the selected run was trained on.
    """
    train = workspace / str(meta["config"]["paths"]["splits_dir"]) / "train.csv"
    if not train.is_file():
        raise FileNotFoundError("The approved training reference split is missing.")
    if hashlib.sha256(train.read_bytes()).hexdigest() != meta["split_hashes"]["train.csv"]:
        raise RuntimeError("The training reference split does not match the selected run.")
    return train
