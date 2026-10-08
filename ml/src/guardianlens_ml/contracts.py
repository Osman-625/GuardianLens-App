# The interfaces each part of a model bundle must offer: one pipeline per signal (visual, textual,
# behavioural) and the fusion step. Real model code and test doubles both implement these.
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ComponentPrediction:
    """One signal's prediction: a probability (None when unavailable) and its explanation data."""

    probability: float | None
    available: bool
    feature_values: dict[str, float]
    metadata: dict[str, str]


class VisualPipeline(Protocol):
    """The visual signal: scores a listing's photos together with its text."""

    version: str

    def predict(self, images: list[bytes], text: str) -> ComponentPrediction:
        """Scores the photos (raw image bytes) against the listing text."""
        ...


class TextualPipeline(Protocol):
    """The textual signal: scores the listing's wording."""

    version: str

    def predict(self, text: str) -> ComponentPrediction:
        """Scores the listing text."""
        ...


class BehaviouralPipeline(Protocol):
    """The behavioural signal: scores the price and the seller details."""

    version: str

    def predict(self, features: dict[str, float | None]) -> ComponentPrediction:
        """Scores the feature values; a missing value is None, never zero."""
        ...


class FusionPipeline(Protocol):
    """The fusion step: combines the available signals into one calibrated probability."""

    version: str

    def predict(
        self,
        component_probabilities: dict[str, float | None],
        availability: dict[str, bool],
    ) -> float:
        """Combines the signal probabilities, ignoring the signals marked unavailable."""
        ...
