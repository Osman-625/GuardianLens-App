# Language scope check for listing text. The prototype supports English, Malay, and a mix of the
# two; text that is mostly Chinese characters is refused. The English and Malay marker words only
# label the text as "en", "ms", or "mixed"; they do not decide whether it is accepted.
from __future__ import annotations

import re

# The Chinese (CJK) character ranges used to measure how much of a text is Chinese.
_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
# Common words that mark a text as Malay or as English ("original" appears in both).
_MALAY_MARKERS = {
    "barang",
    "murah",
    "boleh",
    "saya",
    "jual",
    "harga",
    "nego",
    "cod",
    "pos",
    "keadaan",
    "original",
    "baru",
    "terpakai",
}
_ENGLISH_MARKERS = {
    "sale",
    "price",
    "condition",
    "original",
    "used",
    "new",
    "delivery",
    "seller",
    "warranty",
    "available",
}


def detect_supported_language(text: str) -> str:
    """Labels a listing's language: "unsupported", "mixed", "ms", or "en".

    "unsupported" means at least a fifth of the non-space characters are Chinese. Otherwise the
    marker words decide: both kinds give "mixed", only Malay gives "ms", and anything else "en".
    """
    compact = "".join(text.split())
    if compact:
        cjk_ratio = len(_CJK.findall(compact)) / len(compact)
        if cjk_ratio >= 0.2:
            return "unsupported"

    words = {part.lower() for part in re.findall(r"[A-Za-z]+", text)}
    has_ms = bool(words & _MALAY_MARKERS)
    has_en = bool(words & _ENGLISH_MARKERS)
    if has_ms and has_en:
        return "mixed"
    if has_ms:
        return "ms"
    return "en"
