# Removal of personal contact and financial details from text before it is stored. Each pattern
# below finds one kind of detail; the order in scrub_pii matters, because a phone number is
# replaced before the long-digit rule can mistake it for an account number.
from __future__ import annotations

import re

# An email address, a Malaysian mobile number, an account or card number (10 to 18 digits),
# and a web address.
_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE = re.compile(r"(?<!\d)(?:\+?6?0?1\d[\s.-]?){1}\d{7,8}(?!\d)")
_ACCOUNT = re.compile(r"\b\d{10,18}\b")
_URL = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)


def scrub_pii(text: str) -> str:
    """Redacts common contact and financial identifiers before persistence.

    Emails, phone numbers, long account numbers, and links are replaced with a bracketed label,
    and the whitespace is tidied to single spaces.
    """

    cleaned = _EMAIL.sub("[email redacted]", text)
    cleaned = _PHONE.sub("[phone redacted]", cleaned)
    cleaned = _ACCOUNT.sub("[number redacted]", cleaned)
    cleaned = _URL.sub("[link redacted]", cleaned)
    return " ".join(cleaned.split())
