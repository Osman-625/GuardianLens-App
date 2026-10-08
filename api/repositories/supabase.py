# The Supabase repository for a hosted deployment. It is a deliberate placeholder: every method
# refuses to run until the Supabase project is confirmed and the adapter is written.
from __future__ import annotations

from typing import Never
from uuid import UUID

from api.models.domain import AssessmentRecord, FeedbackRecord


class SupabaseAssessmentRepository:
    """Production adapter boundary.

    The SQL schema is complete in db/migrations. This adapter deliberately refuses to run until
    proposal P-2 and the final Supabase project are confirmed. Refusing explicitly stops a
    production-like environment from silently falling back to a fake database.
    """

    def _pending(self) -> Never:
        """Raises the error every method reports: the adapter is not wired up yet."""
        raise RuntimeError(
            "Supabase adapter is not wired in this first draft. Apply the supplied migrations, "
            "confirm topology P-2, then implement this adapter before disabling stub mode."
        )

    def create_session(self) -> UUID:
        """Not available yet: raises until the adapter is implemented."""
        return self._pending()

    def session_exists(self, session_id: UUID) -> bool:
        """Not available yet: raises until the adapter is implemented."""
        return self._pending()

    def save_assessment(self, assessment: AssessmentRecord) -> None:
        """Not available yet: raises until the adapter is implemented."""
        self._pending()

    def get_assessment(self, assessment_id: UUID) -> AssessmentRecord | None:
        """Not available yet: raises until the adapter is implemented."""
        return self._pending()

    def list_session_assessments(self, session_id: UUID) -> list[AssessmentRecord]:
        """Not available yet: raises until the adapter is implemented."""
        return self._pending()

    def save_feedback(self, feedback: FeedbackRecord) -> None:
        """Not available yet: raises until the adapter is implemented."""
        self._pending()

    def list_all_assessments(self) -> list[AssessmentRecord]:
        """Not available yet: raises until the adapter is implemented."""
        return self._pending()
