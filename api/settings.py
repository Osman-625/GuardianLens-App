# Application settings, read from environment variables and the .env file (see .env.example):
# limits for uploads and text, rate limiting, the allowed website origins (used for CORS), the
# session cookie name, and the optional Supabase and admin configuration. `get_settings` returns
# one cached instance.
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    guardianlens_env: str = "development"
    # True keeps assessments in memory (no database); false uses Supabase.
    guardianlens_stub_mode: bool = True
    # Storage mode is independent of inference: trained models can use local session storage.
    guardianlens_inference_mode: Literal["stub", "trained"] = "stub"
    # The folder of the trained run to serve (its models, fusion.joblib and run.json).
    guardianlens_model_run_dir: Path | None = None
    # The training workspace whose `gl` package defines the classes the saved models were made from.
    guardianlens_training_workspace: Path = (
        Path(__file__).resolve().parents[2] / "GuardianLens_Training"
    )
    # Origins allowed to call the API from a browser (CORS); the website's address by default.
    guardianlens_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    # Name of the httpOnly cookie that carries the website visitor's anonymous session.
    guardianlens_session_cookie: str = "guardianlens_session"
    # Upload limits: how many photos per check and the largest size of each, in bytes.
    guardianlens_max_images: int = 10
    guardianlens_max_image_bytes: int = 5 * 1024 * 1024
    guardianlens_title_max_length: int = 180
    guardianlens_description_max_length: int = 5000
    # Category is free text (any category is accepted), but bounded so it cannot be abused.
    guardianlens_category_max_length: int = 80
    # How many checks one session may start per minute.
    guardianlens_rate_limit_per_minute: int = 6
    # Token for the development admin gate (X-Admin-Token); unset means admin access is refused.
    guardianlens_dev_admin_token: str | None = None

    # Supabase connection details, required only when stub mode is off.
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_anon_key: str | None = None

    @field_validator("guardianlens_allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        """Lets the origins be written as one comma-separated string in the environment."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("guardianlens_allowed_origins")
    @classmethod
    def refuse_wildcard_origin(cls, value: list[str]) -> list[str]:
        """The API sends credentials (the session cookie), so "*" would let any site read them."""
        if "*" in value:
            raise ValueError(
                "GUARDIANLENS_ALLOWED_ORIGINS must list origins; a wildcard is not allowed "
                "because the API sends credentials."
            )
        return value

    def validate_runtime(self) -> None:
        """Stops the start-up when required settings are missing.

        Trained inference needs the model run folder, and a non-stub deployment needs the Supabase
        URL and keys.
        """
        if (
            self.guardianlens_inference_mode == "trained"
            and self.guardianlens_model_run_dir is None
        ):
            raise RuntimeError("Set GUARDIANLENS_MODEL_RUN_DIR before enabling trained inference.")
        if self.guardianlens_stub_mode:
            return
        missing = [
            name
            for name, value in {
                "SUPABASE_URL": self.supabase_url,
                "SUPABASE_SERVICE_ROLE_KEY": self.supabase_service_role_key,
                "SUPABASE_ANON_KEY": self.supabase_anon_key,
            }.items()
            if not value
        ]
        if missing:
            joined = ", ".join(missing)
            raise RuntimeError(f"Missing required production settings: {joined}")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Loads and validates the settings once; later calls return the same instance."""
    settings = Settings()
    settings.validate_runtime()
    return settings
