"""Private, stateless model-only service for the isolated GuardianLens UAT.

Launch separately from the existing production API:
  python -m uvicorn api.model_bridge:app --host 127.0.0.1 --port 8011
This service never opens an AssessmentRepository or the production SQLite DB.
"""
from __future__ import annotations

import asyncio
import hmac
import os
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from api.models.domain import AssessmentRecord, SellerInput
from api.schemas import AssessmentResultResponse, SignalCard
from api.services.images import ImageLimits, validate_and_reencode_images
from api.services.language import detect_supported_language
from api.services.orchestrator import DISCLAIMER, SUGGESTED_CHECKS
from api.services.pipelines import SignalOutput
from api.services.privacy import scrub_pii
from api.services.trained_models import TrainedModels
from api.settings import get_settings


class BridgeHealth(BaseModel):
    status: str
    bundle: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    token = os.environ.get("GUARDIANLENS_MODEL_BRIDGE_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("GUARDIANLENS_MODEL_BRIDGE_TOKEN must have 32+ characters")
    settings = get_settings()
    if settings.guardianlens_inference_mode != "trained":
        raise RuntimeError("Model bridge refuses stub scores; enable trained inference")
    models = TrainedModels(settings)
    await asyncio.to_thread(models.warm_up)
    app.state.models = models
    app.state.token = token
    app.state.score_lock = asyncio.Lock()
    yield


app = FastAPI(title="GuardianLens private model bridge", lifespan=lifespan, docs_url=None, redoc_url=None)


def authorize(expected: str, actual: str | None) -> None:
    if not actual or not hmac.compare_digest(expected, actual):
        raise HTTPException(status_code=401, detail="Unauthorized")


def card(output: SignalOutput) -> SignalCard:
    return SignalCard(
        signal=output.signal,
        probability=output.probability,
        available=output.available,
        status_word=output.status_word,
        summary=output.summary,
        reasons=output.reasons,
        scope_note=output.scope_note,
    )


@app.get("/health", response_model=BridgeHealth)
async def health(x_uat_model_key: str | None = Header(default=None)) -> BridgeHealth:
    authorize(app.state.token, x_uat_model_key)
    return BridgeHealth(status="ready", bundle=app.state.models.label)


@app.post("/score", response_model=AssessmentResultResponse)
async def score(
    images: list[UploadFile] = File(...),
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    platform: str = Form(...),
    price: float = Form(...),
    account_age_days: int | None = Form(default=None),
    rating: float | None = Form(default=None),
    review_count: int | None = Form(default=None),
    active_listing_count: int | None = Form(default=None),
    x_uat_model_key: str | None = Header(default=None),
) -> AssessmentResultResponse:
    authorize(app.state.token, x_uat_model_key)
    settings = get_settings()
    if not title.strip() or not description.strip() or not category.strip():
        raise HTTPException(status_code=422, detail="Missing listing fields")
    if len(title) > settings.guardianlens_title_max_length or len(description) > settings.guardianlens_description_max_length or len(category) > settings.guardianlens_category_max_length:
        raise HTTPException(status_code=422, detail="Listing fields exceed the input limits")
    if platform not in ("carousell", "mudah") or not 0 <= price <= 10_000_000:
        raise HTTPException(status_code=422, detail="Invalid platform or price")
    if any(v is not None and not 0 <= v <= 10_000_000 for v in (account_age_days, review_count, active_listing_count)):
        raise HTTPException(status_code=422, detail="Invalid seller count")
    if rating is not None and not 0 <= rating <= 5:
        raise HTTPException(status_code=422, detail="Invalid rating")
    language = detect_supported_language(f"{title} {description}")
    if language == "unsupported":
        raise HTTPException(status_code=422, detail="Unsupported listing language")
    # Use the same image validation and metadata stripping as the ordinary API.
    try:
        clean_images = await validate_and_reencode_images(
            images, ImageLimits(settings.guardianlens_max_images, settings.guardianlens_max_image_bytes)
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid listing photos") from exc
    assessment = AssessmentRecord(
        session_id=uuid4(),
        title_scrubbed=scrub_pii(title),
        title_for_inference=title,
        description_for_inference=description,
        category=category,
        platform=platform,
        price=price,
        language_detected=language,
        seller=SellerInput(account_age_days, rating, review_count, active_listing_count),
        images=clean_images,
    )
    models = app.state.models

    def compute() -> AssessmentResultResponse:
        started = time.perf_counter()
        try:
            visual = models.run_visual(assessment)
            textual = models.run_textual(assessment)
            behavioural = models.run_behavioural(assessment)
            outputs = [visual, textual, behavioural]
            value, band = models.fuse(outputs)
            missing = sum(not output.available for output in outputs)
            notices = [
                f"This result uses {len(outputs) - missing} of {len(outputs)} checks. "
                "An unavailable check is unknown, not suspicious."
            ] if missing else []
            return AssessmentResultResponse(
                assessment_id=assessment.id,
                title=assessment.title_scrubbed,
                score=value,
                band=band,
                signal_cards=[card(output) for output in outputs],
                missing_data_notices=notices,
                suggested_checks=SUGGESTED_CHECKS,
                disclaimer=DISCLAIMER,
                model_bundle_label=models.label,
                created_at=datetime.now(UTC),
                total_latency_ms=round((time.perf_counter() - started) * 1000),
                development_stub=False,
            )
        finally:
            assessment.title_for_inference = ""
            assessment.description_for_inference = ""
            for image in assessment.images:
                image.content = b""

    # One model inference at a time, protecting CPU/RAM on the current machine.
    async with app.state.score_lock:
        return await asyncio.to_thread(compute)
