# The in-memory repository used for development and tests: everything lives in this process and is
# gone when the server stops. A lock makes it safe to use from the request threads and from the
# background task that scores an assessment.
from __future__ import annotations

from threading import RLock
from uuid import UUID, uuid4

from api.models.domain import AssessmentRecord, FeedbackRecord


class InMemoryAssessmentRepository:
    """Development and test repository. It never writes research data."""

    def __init__(self) -> None:
        """Starts empty: no sessions, no assessments, no feedback."""
        self._sessions: set[UUID] = set()
        self._assessments: dict[UUID, AssessmentRecord] = {}
        self._feedback: dict[UUID, FeedbackRecord] = {}
        self._lock = RLock()

    def create_session(self) -> UUID:
        """Creates an anonymous session and returns its id."""
        session_id = uuid4()
        with self._lock:
            self._sessions.add(session_id)
        return session_id

    def session_exists(self, session_id: UUID) -> bool:
        """Tells whether a session id was issued by this repository."""
        with self._lock:
            return session_id in self._sessions

    def save_assessment(self, assessment: AssessmentRecord) -> None:
        """Stores a new assessment, or replaces the stored one that has the same id."""
        with self._lock:
            self._assessments[assessment.id] = assessment

    def get_assessment(self, assessment_id: UUID) -> AssessmentRecord | None:
        """Returns one assessment by id, or None when there is none."""
        with self._lock:
            return self._assessments.get(assessment_id)

    def list_session_assessments(self, session_id: UUID) -> list[AssessmentRecord]:
        """Returns one session's assessments, newest first."""
        with self._lock:
            records = [item for item in self._assessments.values() if item.session_id == session_id]
        return sorted(records, key=lambda item: item.created_at, reverse=True)

    def save_feedback(self, feedback: FeedbackRecord) -> None:
        """Stores feedback for an assessment, replacing any earlier feedback for it."""
        with self._lock:
            self._feedback[feedback.assessment_id] = feedback

    def list_all_assessments(self) -> list[AssessmentRecord]:
        """Returns every assessment of every session, newest first (for the admin page)."""
        with self._lock:
            return sorted(
                self._assessments.values(), key=lambda item: item.created_at, reverse=True
            )
