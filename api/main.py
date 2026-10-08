# Application factory: builds the FastAPI app from the settings, chooses the repository (in memory
# or Supabase), configures CORS for the website and the extension, registers the error handlers
# that produce the API's error envelope, and mounts the routers.
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.errors import AppError
from api.repositories.memory import InMemoryAssessmentRepository
from api.repositories.supabase import SupabaseAssessmentRepository
from api.routers import admin, assess, feedback, health, session
from api.schemas import ErrorDetail, ErrorEnvelope
from api.services.rate_limit import SessionRateLimiter
from api.services.trained_models import TrainedModels
from api.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Builds the app's shared services at start-up and keeps them on `app.state`.

    That is the settings, the saved models (only in trained mode, loaded once here so a missing
    file stops the start-up instead of failing a request), the repository, and the rate limiter.
    """
    settings = get_settings()
    app.state.settings = settings
    app.state.trained_models = (
        TrainedModels(settings) if settings.guardianlens_inference_mode == "trained" else None
    )
    app.state.repository = (
        InMemoryAssessmentRepository()
        if settings.guardianlens_stub_mode
        else SupabaseAssessmentRepository()
    )
    app.state.rate_limiter = SessionRateLimiter(settings.guardianlens_rate_limit_per_minute)
    yield


def create_app() -> FastAPI:
    """Creates the FastAPI application with its CORS rules, error handlers, and routers."""
    settings = get_settings()
    application = FastAPI(
        title="GuardianLens API",
        version="0.1.0",
        description=(
            "GuardianLens assessment API with explicit development stubs or "
            "saved TF-IDF, XGBoost, visual and calibrated fusion models."
        ),
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.guardianlens_allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Admin-Token", "X-Session-Token"],
    )

    @application.exception_handler(RequestValidationError)
    async def handle_request_validation(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Answers a request that failed validation with a 422 naming the first bad field."""
        del request
        first = exc.errors()[0] if exc.errors() else {}
        location = first.get("loc", ())
        field = str(location[-1]) if location else None
        payload = ErrorEnvelope(
            error=ErrorDetail(
                code="validation_error",
                message="Check the highlighted field and try again.",
                field=field,
            )
        )
        return JSONResponse(status_code=422, content=payload.model_dump())

    @application.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        """Answers a deliberate AppError with its own status, code, message, and field."""
        del request
        payload = ErrorEnvelope(
            error=ErrorDetail(code=exc.code, message=exc.message, field=exc.field)
        )
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump())

    @application.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        """Answers any other failure with a generic 500 that reveals no internal detail."""
        del request, exc
        payload = ErrorEnvelope(
            error=ErrorDetail(
                code="internal_error",
                message="The request could not be completed. Try again.",
                field=None,
            )
        )
        return JSONResponse(status_code=500, content=payload.model_dump())

    application.include_router(health.router)
    application.include_router(assess.router)
    application.include_router(feedback.router)
    application.include_router(session.router)
    application.include_router(admin.router)
    return application


# The application object that uvicorn serves (`uvicorn api.main:app`).
app = create_app()
