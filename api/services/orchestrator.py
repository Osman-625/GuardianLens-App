# Runs one assessment through the five stages (visual, textual, behavioural, fusion, explanation)
# in the background and stores the outcome. It uses the trained models when they are loaded and
# the explicit development stubs otherwise. The buyer's raw text and the photo bytes are cleared
# as soon as the assessment ends, whether it succeeded or failed.
from __future__ import annotations

import time
from datetime import UTC, datetime

from api.models.domain import AssessmentRecord
from api.repositories.base import AssessmentRepository
from api.schemas import (
    AssessmentResultResponse,
    AssessmentStatus,
    PipelineStage,
    RiskBand,
    SignalCard,
)
from api.services.pipelines import (
    SignalOutput,
    run_behavioural_stub,
    run_textual_stub,
    run_visual_stub,
)
from api.services.trained_models import TrainedModels

# The caveat shown with every score, the extra warning shown only on stub scores, and the manual
# checks every result suggests.
DISCLAIMER = (
    "GuardianLens supports your judgement and cannot confirm whether a listing is fraudulent. "
    "Verify the seller and payment details independently before paying."
)
DEVELOPMENT_NOTICE = (
    "Development stub output. It is not produced by the trained GuardianLens models and must not "
    "be used as research evidence or as a real fraud assessment."
)
SUGGESTED_CHECKS = [
    "Compare the price with similar listings on the same marketplace.",
    "Ask for a new photo showing the item with a specific handwritten note.",
    "Keep communication and payment inside the marketplace where possible.",
    "Verify account or bank details independently using the official Semak Mule service.",
]


def _to_card(output: SignalOutput) -> SignalCard:
    """Converts one signal's output into the card shown on the result."""
    return SignalCard(
        signal=output.signal,
        probability=output.probability,
        available=output.available,
        status_word=output.status_word,
        summary=output.summary,
        reasons=output.reasons,
        scope_note=output.scope_note,
    )


def _stub_band(score: int) -> RiskBand:
    """Maps a stub score to a band with fixed development boundaries (33 and 66)."""
    if score <= 33:
        return RiskBand.LOW
    if score <= 66:
        return RiskBand.MODERATE
    return RiskBand.HIGH


def run_development_assessment(
    assessment: AssessmentRecord,
    repository: AssessmentRepository,
    models: TrainedModels | None = None,
) -> None:
    """Runs the configured model bundle, or the explicit development stubs, for one assessment.

    Each stage is saved as it starts, so the status endpoint can report real progress. On success
    the result is stored and the assessment is marked complete; on any error it is marked failed
    with a plain message and the error is raised again.
    """

    started = time.perf_counter()
    try:
        assessment.stage = PipelineStage.VISUAL
        repository.save_assessment(assessment)
        visual = models.run_visual(assessment) if models else run_visual_stub(assessment.images)

        assessment.stage = PipelineStage.TEXTUAL
        repository.save_assessment(assessment)
        textual = (
            models.run_textual(assessment)
            if models
            else run_textual_stub(
                assessment.title_for_inference, assessment.description_for_inference
            )
        )

        assessment.stage = PipelineStage.BEHAVIOURAL
        repository.save_assessment(assessment)
        behavioural = (
            models.run_behavioural(assessment)
            if models
            else run_behavioural_stub(assessment.seller, assessment.price)
        )

        assessment.stage = PipelineStage.FUSION
        repository.save_assessment(assessment)
        available = [
            output.probability
            for output in (visual, textual, behavioural)
            if output.available and output.probability is not None
        ]
        if models:
            score, band = models.fuse([visual, textual, behavioural])
        else:
            fused = sum(available) / len(available)
            score = round(fused * 100)
            band = _stub_band(score)

        assessment.stage = PipelineStage.EXPLANATION
        repository.save_assessment(assessment)
        missing_notices = [
            output.summary for output in (visual, textual, behavioural) if not output.available
        ]
        total_latency_ms = round((time.perf_counter() - started) * 1000)
        result = AssessmentResultResponse(
            assessment_id=assessment.id,
            title=assessment.title_scrubbed,
            score=score,
            band=band,
            signal_cards=[_to_card(output) for output in (visual, textual, behavioural)],
            missing_data_notices=missing_notices,
            suggested_checks=SUGGESTED_CHECKS,
            disclaimer=(DISCLAIMER if models else f"{DEVELOPMENT_NOTICE} {DISCLAIMER}"),
            model_bundle_label=models.label if models else "dev-stub-unvalidated",
            created_at=assessment.created_at,
            total_latency_ms=total_latency_ms,
            development_stub=models is None,
        )
        assessment.result = result
        assessment.status = AssessmentStatus.COMPLETE
        assessment.stage = None
        assessment.completed_at = datetime.now(UTC)
        # The raw wording and the photo bytes are only needed for scoring; clear them now.
        assessment.title_for_inference = ""
        assessment.description_for_inference = ""
        for image in assessment.images:
            image.content = b""
        repository.save_assessment(assessment)
    except Exception:
        assessment.status = AssessmentStatus.FAILED
        assessment.stage = None
        assessment.error_code = "pipeline_failed"
        assessment.error_message = (
            "The check could not be completed. Try again with the saved form."
        )
        # A failed check also clears the raw wording and the photo bytes.
        assessment.title_for_inference = ""
        assessment.description_for_inference = ""
        for image in assessment.images:
            image.content = b""
        repository.save_assessment(assessment)
        raise
