# The health endpoint: reports whether the API is up, which kind of scores it produces (development
# stub or trained), and whether the trained run's files and visual models are ready.
from __future__ import annotations

from fastapi import APIRouter, Request

from api.dependencies import get_app_settings
from api.schemas import HealthResponse
from api.services.trained_models import missing_artifacts

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    """Returns the API's status, inference mode, active bundle, and model readiness."""
    settings = get_app_settings(request)
    models = request.app.state.trained_models
    run_dir = settings.guardianlens_model_run_dir
    return HealthResponse(
        status="ok",
        environment=settings.guardianlens_env,
        stub_mode=models is None,
        inference_mode=settings.guardianlens_inference_mode,
        model_bundle_label=models.label if models else "dev-stub-unvalidated",
        configured_model_run=str(run_dir) if run_dir else None,
        missing_model_artifacts=missing_artifacts(run_dir) if run_dir else [],
        visual_model_ready=bool(models and models.visual_engine),
        visual_unavailable_reason=models.visual_unavailable if models else None,
    )
