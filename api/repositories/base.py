# The storage interface the routers and services depend on. Two classes implement it: an in-memory
# repository for development and tests, and the Supabase adapter for a hosted deployment.
from __future__ import annotations

from typing import Protocol
from uuid import UUID

from api.models.domain import AssessmentRecord, FeedbackRecord


class AssessmentRepository(Protocol):
    """Where sessions, assessments, and feedback are kept."""

    def create_session(self) -> UUID:
        """Creates an anonymous session and returns its id."""
        ...

    def session_exists(self, session_id: UUID) -> bool:
        """Tells whether a session id was issued by this repository."""
        ...

    def save_assessment(self, assessment: AssessmentRecord) -> None:
        """Stores a new assessment, or replaces the stored one that has the same id."""
        ...

    def get_assessment(self, assessment_id: UUID) -> AssessmentRecord | None:
        """Returns one assessment by id, or None when there is none."""
        ...

    def list_session_assessments(self, session_id: UUID) -> list[AssessmentRecord]:
        """Returns one session's assessments, newest first."""
        ...

    def save_feedback(self, feedback: FeedbackRecord) -> None:
        """Stores feedback for an assessment, replacing any earlier feedback for it."""
        ...

    def list_all_assessments(self) -> list[AssessmentRecord]:
        """Returns every assessment of every session, newest first (for the admin page)."""
        ...
