"""Isolated GuardianLens UAT API. No access to production SQLite or model artifacts.

Run in one process on loopback. The website proxies /api/uat/* to this application.
UAT records are pseudonymous and study photos stay in a separate private directory.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import os
import secrets
import sqlite3
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from api.services.privacy import scrub_pii

ROOT = Path(__file__).resolve().parents[1]
DATABASE = Path(os.environ.get("GUARDIANLENS_UAT_DB", str(ROOT / "uat" / "data" / "study.sqlite3"))).resolve()
PHOTOS = (ROOT / "uat" / "data" / "photos").resolve()
PRODUCTION_DB = (ROOT / "data" / "guardianlens.sqlite3").resolve()
if DATABASE == PRODUCTION_DB:
    raise RuntimeError("Refusing to open the production SQLite database as UAT storage")
COOKIE = "guardianlens_uat"
COOKIE_SECURE = os.environ.get("GUARDIANLENS_UAT_COOKIE_SECURE", "false").lower() == "true"
MODEL_URL = os.environ.get("GUARDIANLENS_MODEL_BRIDGE_URL", "http://127.0.0.1:8011").rstrip("/")
MODEL_KEY = os.environ.get("GUARDIANLENS_MODEL_BRIDGE_TOKEN", "")
INVITE_CODE = os.environ.get("GUARDIANLENS_UAT_INVITE_CODE", "")
MAX_CASES = int(os.environ.get("GUARDIANLENS_UAT_MAX_CASES", "5"))
ALLOWED = {"mudah.my", "www.mudah.my", "carousell.com.my", "www.carousell.com.my"}
CAPTURE_WORKER = ROOT / "uat" / "capture.mjs"

_SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS participants (
 id TEXT PRIMARY KEY, cookie_hash TEXT NOT NULL UNIQUE, consent_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
 id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
 url TEXT NOT NULL, listing_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trials (
 id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
 case_id TEXT NOT NULL REFERENCES cases(id), before_judgement TEXT NOT NULL,
 before_confidence INTEGER NOT NULL, before_ms INTEGER NOT NULL,
 after_judgement TEXT, after_confidence INTEGER, after_ms INTEGER,
 model_result_json TEXT, created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS reviews (
 participant_id TEXT PRIMARY KEY REFERENCES participants(id),
 ratings_json TEXT NOT NULL, paragraph_scrubbed TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 participant_id TEXT NOT NULL REFERENCES participants(id),
 case_id TEXT, trial_id TEXT, event TEXT NOT NULL,
 occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_participant ON cases(participant_id);
CREATE INDEX IF NOT EXISTS idx_trials_participant ON trials(participant_id);
"""


def now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self) -> None:
        DATABASE.parent.mkdir(parents=True, exist_ok=True)
        PHOTOS.mkdir(parents=True, exist_ok=True)
        self.lock = RLock()
        self.db = sqlite3.connect(str(DATABASE), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock, self.db:
            self.db.executescript(_SCHEMA)

    def one(self, query: str, args: tuple = ()) -> sqlite3.Row | None:
        with self.lock:
            return self.db.execute(query, args).fetchone()

    def all(self, query: str, args: tuple = ()) -> list[sqlite3.Row]:
        with self.lock:
            return self.db.execute(query, args).fetchall()

    def execute(self, query: str, args: tuple = ()) -> None:
        with self.lock, self.db:
            self.db.execute(query, args)

    def log(self, who: str, event: str, case: str | None = None, trial: str | None = None) -> None:
        self.execute(
            "INSERT INTO events(participant_id,case_id,trial_id,event,occurred_at) VALUES(?,?,?,?,?)",
            (who, case, trial, event, now()),
        )


store = Store()
app = FastAPI(title="GuardianLens isolated UAT", docs_url=None, redoc_url=None)
capture_lock = asyncio.Lock()
score_lock = asyncio.Lock()


def require_participant(token: str | None) -> str:
    if not token:
        raise HTTPException(401, "Start the UAT and consent first")
    digest = hashlib.sha256(token.encode()).hexdigest()
    row = store.one("SELECT id FROM participants WHERE cookie_hash=?", (digest,))
    if not row:
        raise HTTPException(401, "Study session expired")
    return str(row["id"])


def require_case(who: str, case_id: str) -> sqlite3.Row:
    row = store.one("SELECT * FROM cases WHERE id=? AND participant_id=?", (case_id, who))
    if not row:
        raise HTTPException(404, "Case not found")
    return row


def require_trial(who: str, trial_id: str) -> sqlite3.Row:
    row = store.one("SELECT * FROM trials WHERE id=? AND participant_id=?", (trial_id, who))
    if not row:
        raise HTTPException(404, "Trial not found")
    return row


class Start(BaseModel):
    consent: bool
    invite_code: str = ""


class CaptureInput(BaseModel):
    url: str = Field(min_length=12, max_length=2048)


class Decision(BaseModel):
    judgement: str
    confidence: int = Field(ge=1, le=5)
    elapsed_ms: int = Field(ge=0, le=900000)


class TrialStart(Decision):
    case_id: str


class Review(BaseModel):
    ratings: list[int] = Field(min_length=7, max_length=7)
    paragraph: str = Field(min_length=30, max_length=2000)


def check_judgement(value: str) -> None:
    if value not in {"suspicious", "not_suspicious", "unsure"}:
        raise HTTPException(422, "Invalid judgement")


def case_public(row: sqlite3.Row) -> dict:
    listing = json.loads(row["listing_json"])
    return {
        "case_id": row["id"], "url": row["url"], "platform": listing["platform"],
        "title": listing["title"], "description": listing["description"],
        "price": listing["price"], "category": listing["category"],
        "seller": listing["seller"], "image_count": len(listing["photos"]),
        "adapter_version": listing["adapter_version"],
    }


@app.get("/health")
def health() -> dict:
    # No model key, database path or private deployment information is exposed.
    return {"status": "ok", "mode": "isolated-uat"}


@app.post("/start")
def start(payload: Start, response: Response, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    if not payload.consent:
        raise HTTPException(422, "Consent is required")
    if not INVITE_CODE or not secrets.compare_digest(payload.invite_code, INVITE_CODE):
        raise HTTPException(403, "Invalid study invitation code")
    if guardianlens_uat:
        digest = hashlib.sha256(guardianlens_uat.encode()).hexdigest()
        existing = store.one("SELECT id FROM participants WHERE cookie_hash=?", (digest,))
        if existing:
            return {"participant_id": existing["id"], "consented": True}
    participant = str(uuid4())
    token = secrets.token_urlsafe(32)
    store.execute(
        "INSERT INTO participants(id,cookie_hash,consent_at) VALUES(?,?,?)",
        (participant, hashlib.sha256(token.encode()).hexdigest(), now()),
    )
    store.log(participant, "consented")
    response.set_cookie(
        COOKIE, token, httponly=True, secure=COOKIE_SECURE,
        samesite="strict", max_age=7 * 24 * 3600, path="/",
    )
    return {"participant_id": participant, "consented": True}


@app.get("/session")
def session(guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    count = store.one("SELECT COUNT(*) AS n FROM cases WHERE participant_id=?", (who,))
    review = store.one("SELECT 1 FROM reviews WHERE participant_id=?", (who,))
    return {"participant_id": who, "case_count": count["n"], "review_submitted": review is not None}


def validate_listing_url(raw: str) -> str:
    parsed = urlsplit(raw)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED or parsed.username or parsed.password or parsed.port:
        raise HTTPException(422, "Paste an HTTPS Mudah.my or Carousell product URL")
    return raw


def store_photo(case_id: str, index: int, photo: dict) -> str:
    raw = base64.b64decode(photo["data"], validate=True)
    if len(raw) > 5 * 1024 * 1024:
        raise ValueError("Photo exceeds the size limit")
    # Re-encode through Pillow to remove external EXIF and metadata.
    with Image.open(io.BytesIO(raw)) as im:
        if im.width * im.height > 30_000_000:
            raise ValueError("Photo exceeds pixel limit")
        final = ImageOps.exif_transpose(im).convert("RGB")
        stream = io.BytesIO()
        final.save(stream, format="JPEG", quality=85)
    directory = PHOTOS / case_id
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{index}.jpg"
    (directory / filename).write_bytes(stream.getvalue())
    return filename


@app.post("/capture")
async def capture(payload: CaptureInput, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    url = validate_listing_url(payload.url)
    if store.one("SELECT COUNT(*) AS n FROM cases WHERE participant_id=?", (who,))["n"] >= MAX_CASES:
        raise HTTPException(429, "Study listing limit reached")
    store.log(who, "capture_started")
    async with capture_lock:
        try:
            process = await asyncio.create_subprocess_exec(
                "node", str(CAPTURE_WORKER), url,
                cwd=str(ROOT), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=65)
        except TimeoutError as exc:
            if "process" in locals():
                process.kill()
                await process.communicate()
            store.log(who, "capture_timed_out")
            raise HTTPException(504, "Marketplace capture timed out") from exc
        if process.returncode != 0:
            store.log(who, "capture_failed")
            # Never return raw marketplace page text or internal stack traces to participants.
            raise HTTPException(422, "The listing could not be captured. Try another public listing.")
    try:
        captured = json.loads(stdout)
        case_id = str(uuid4())
        photos = [store_photo(case_id, i, photo) for i, photo in enumerate(captured["images"])]
        listing = {
            "platform": captured["platform"],
            "title": scrub_pii(captured["title"]),
            "description": scrub_pii(captured["description"]),
            "price": captured["price"],
            "category": captured["category"],
            "seller": captured["seller"],
            "photos": photos,
            "adapter_version": captured["adapterVersion"],
            "page_state": captured["pageState"],
        }
        store.execute(
            "INSERT INTO cases(id,participant_id,url,listing_json,created_at) VALUES(?,?,?,?,?)",
            (case_id, who, url, json.dumps(listing), now()),
        )
    except (KeyError, ValueError, OSError, TypeError) as exc:
        store.log(who, "capture_invalid")
        raise HTTPException(422, "The captured listing was incomplete") from exc
    store.log(who, "capture_completed", case_id)
    return case_public(require_case(who, case_id))


@app.get("/case/{case_id}")
def get_case(case_id: str, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    return case_public(require_case(require_participant(guardianlens_uat), case_id))


@app.get("/case/{case_id}/image/{image_index}")
def get_image(case_id: str, image_index: int, guardianlens_uat: str | None = Cookie(default=None)):
    who = require_participant(guardianlens_uat)
    listing = json.loads(require_case(who, case_id)["listing_json"])
    images = listing["photos"]
    if image_index < 0 or image_index >= len(images):
        raise HTTPException(404, "Image not found")
    return FileResponse(PHOTOS / case_id / images[image_index], media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@app.post("/trial/start")
def start_trial(payload: TrialStart, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    require_case(who, payload.case_id)
    check_judgement(payload.judgement)
    trial_id = str(uuid4())
    store.execute(
        "INSERT INTO trials(id,participant_id,case_id,before_judgement,before_confidence,before_ms,created_at) VALUES(?,?,?,?,?,?,?)",
        (trial_id, who, payload.case_id, payload.judgement, payload.confidence, payload.elapsed_ms, now()),
    )
    store.log(who, "unaided_submitted", payload.case_id, trial_id)
    return {"trial_id": trial_id}


@app.post("/trial/{trial_id}/score")
async def score_trial(trial_id: str, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    if not MODEL_KEY:
        raise HTTPException(503, "The study model service is not configured")
    async with score_lock:
        trial = require_trial(who, trial_id)
        if trial["model_result_json"]:
            return json.loads(trial["model_result_json"])
        case = require_case(who, str(trial["case_id"]))
        listing = json.loads(case["listing_json"])
        data = {
            "title": listing["title"], "description": listing["description"],
            "category": listing["category"], "platform": listing["platform"],
            "price": str(listing["price"]),
        }
        for key in ("accountAgeDays", "rating", "reviewCount", "activeListingCount"):
            prop = {"accountAgeDays": "account_age_days", "rating": "rating",
                    "reviewCount": "review_count", "activeListingCount": "active_listing_count"}[key]
            value = listing["seller"].get(key)
            if value is not None:
                data[prop] = str(value)
        files = []
        for filename in listing["photos"]:
            image = (PHOTOS / case["id"] / filename).read_bytes()
            files.append(("images", (filename, image, "image/jpeg")))
        try:
            async with httpx.AsyncClient(timeout=130.0) as client:
                result = await client.post(
                    MODEL_URL + "/score", data=data, files=files,
                    headers={"X-UAT-Model-Key": MODEL_KEY},
                )
                result.raise_for_status()
                assessment = result.json()
        except (httpx.HTTPError, ValueError) as exc:
            store.log(who, "scoring_failed", str(trial["case_id"]), trial_id)
            raise HTTPException(502, "Model service did not complete the check") from exc
        if assessment.get("development_stub") or not assessment.get("model_bundle_label"):
            raise HTTPException(502, "Model service did not return a trained result")
        store.execute("UPDATE trials SET model_result_json=? WHERE id=?", (json.dumps(assessment), trial_id))
        store.log(who, "model_result_shown", str(trial["case_id"]), trial_id)
        return assessment


@app.post("/trial/{trial_id}/finish")
def finish_trial(trial_id: str, payload: Decision, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    check_judgement(payload.judgement)
    trial = require_trial(who, trial_id)
    if not trial["model_result_json"]:
        raise HTTPException(409, "Complete the model assessment first")
    if trial["completed_at"] is None:
        store.execute(
            "UPDATE trials SET after_judgement=?,after_confidence=?,after_ms=?,completed_at=? WHERE id=?",
            (payload.judgement, payload.confidence, payload.elapsed_ms, now(), trial_id),
        )
        store.log(who, "assisted_submitted", str(trial["case_id"]), trial_id)
    return {"complete": True}


@app.get("/trials")
def my_trials(guardianlens_uat: str | None = Cookie(default=None)) -> list[dict]:
    who = require_participant(guardianlens_uat)
    return [
        dict(id=row["id"], case_id=row["case_id"], before=row["before_judgement"],
             after=row["after_judgement"], completed=bool(row["completed_at"]))
        for row in store.all("SELECT * FROM trials WHERE participant_id=? ORDER BY created_at DESC", (who,))
    ]


@app.post("/review")
def review(payload: Review, guardianlens_uat: str | None = Cookie(default=None)) -> dict:
    who = require_participant(guardianlens_uat)
    if any(value < 1 or value > 5 for value in payload.ratings):
        raise HTTPException(422, "Ratings must be from 1 to 5")
    if not store.one("SELECT 1 FROM trials WHERE participant_id=? AND completed_at IS NOT NULL", (who,)):
        raise HTTPException(409, "Complete at least one listing trial first")
    store.execute(
        "INSERT INTO reviews(participant_id,ratings_json,paragraph_scrubbed,created_at) VALUES(?,?,?,?) "
        "ON CONFLICT(participant_id) DO UPDATE SET ratings_json=excluded.ratings_json,"
        "paragraph_scrubbed=excluded.paragraph_scrubbed,created_at=excluded.created_at",
        (who, json.dumps(payload.ratings), scrub_pii(payload.paragraph), now()),
    )
    store.log(who, "review_submitted")
    return {"saved": True}
