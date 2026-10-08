# GuardianLens FYP2 First Draft

GuardianLens is a multimodal, explainable fraud-risk decision-support prototype for buyers checking Mudah.my and Carousell product listings before payment. This archive turns the supplied pre-implementation documents into a runnable product scaffold while preserving the locked scope and separating development stubs from research evidence.

## Read this first

Inference defaults to `GUARDIANLENS_INFERENCE_MODE=stub`. For the latest trained TF-IDF/text-cues, XGBoost, CLIP/SSCD and calibrated fusion run, see [trained model setup](docs/TRAINED_MODELS.md). `GUARDIANLENS_STUB_MODE=true` selects local in-memory storage independently of inference. Trained mode loads saved artifacts and never silently substitutes development scores.

Stub scores are displayed with a permanent warning. They are not CLIP, SSCD, TF-IDF/text-cues, XGBoost, calibrated late-fusion, or SHAP results. They must not be used in Chapter 4 metrics, the user study, a real buying decision, or any claim that GuardianLens has been trained.

## Included

- Next.js and TypeScript source for landing, submission, processing, result, explanation, feedback, session history, and research administration.
- FastAPI endpoints matching the proposed `/api/v1` contract.
- Field-level validation, unsupported Chinese-dominant text rejection, image type and size checks, metadata-stripping re-encoding, PII scrubbing, session ownership checks, feedback, history, rate limiting, and structured error envelopes.
- Development-only five-stage pipeline stubs with explicit missing-signal handling.
- Supabase SQL migrations for the product schema, research schema, RLS posture, private storage buckets, and the hold-out study-listing trigger.
- ML interfaces, bundle-manifest schema, explanation-template draft, and a latency harness that marks stub timing invalid for NFR-02.
- Research CSV templates and draft consent, session, and questionnaire materials. No generated labels, participants, or study rows are included.
- Automated backend and ML contract tests, CI source, secret scanning, and prose punctuation checks.
- The original eight specification documents under `docs/spec/`.

## Repository map

```text
guardianlens/
  frontend/             Next.js screens S1 to S7
  extension/            Browser extension (WXT): captures a listing on click, result in a side panel
  shared/               Types, API client, design tokens, and components used by the site and the extension
  api/                  FastAPI application and tests
  ml/                   Contracts, bundle schema, configs, and latency harness
  db/migrations/        Supabase migrations
  research/             Human-only import templates and study drafts
  docs/spec/             Supplied pre-implementation documents
  docs/plans/            Build and next-step records
  docs/ch4-notes/        Incremental implementation notes
  scripts/               Local development and verification helpers
```

## Quick start on Windows

Prerequisites: Conda (Anaconda or Miniconda), Node.js 22 or newer, npm, and Git. The conda environment installs Python 3.13 for you (`pyproject.toml` supports 3.12 and 3.13, not 3.14).

```powershell
cd GuardianLens_codebase
conda env create -f environment.yml
conda activate Guardianlens_venv
npm install
Copy-Item .env.example .env
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
```

`environment.yml` installs the API, the saved-model serving packages (scikit-learn, XGBoost, torch, transformers), and the test tools. `npm install` at the repository root installs all three JavaScript packages (`shared`, `extension`, `frontend`) as npm workspaces. To update the environment after `pyproject.toml` changes: `conda env update -f environment.yml --prune`.

Open:

- Web: `http://localhost:3000`
- API health: `http://localhost:8000/health`
- OpenAPI: `http://localhost:8000/docs`

## Quick start on Linux or macOS

```bash
cd GuardianLens_codebase
conda env create -f environment.yml
conda activate Guardianlens_venv
npm install
cp .env.example .env
./scripts/dev.sh
```

## Browser extension

The extension captures one listing when you click its icon on a Mudah.my or Carousell listing, lets you review the captured fields, and shows the result in the browser side panel. "See full explanation" opens the website on the same result, after you confirm linking the browser to the extension's session.

Build and load it:

```bash
npm run build -w extension
```

Then open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose Load unpacked, and select `extension/.output/chrome-mv3`.

Settings are build-time environment variables: `WXT_API_BASE_URL` (default `http://localhost:8000`) and `WXT_SITE_BASE_URL` (default `http://localhost:3000`). Changing the API origin is a rebuild, because the origin is also written into the extension's host permissions.

To offer the extension from the website's landing page, run `npm run package:site -w extension`.

Capture boundary: the extension reads a page only on the buyer's click, only that one page, and only on the two marketplaces. It never crawls, never runs in the background, and never navigates by itself. Its permissions are `activeTab`, `scripting`, `storage`, and `sidePanel`, and it has no standing access to the marketplace sites.

Developer helper: `python scripts/dev_handoff_demo.py` plays the extension's part of the session handoff and prints a website URL that should open the result after the confirmation prompt.

## Verification commands

```bash
pytest -q
python -m compileall -q api ml scripts
python scripts/secret_scan.py
python scripts/check_prose.py

npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -w extension
```

Last full run (2026-10-05): the Python suite passed with 32 tests, ruff, mypy, the secret scan, and the prose punctuation check were clean, and the JavaScript checks passed (shared 57 tests, extension 245 tests with 2 real-page fixture files skipped until recorded pages are added, lint, typecheck, production build, and 2 browser end-to-end tests). The manual checks that need live marketplace pages and a real browser are listed in `docs/superpowers/audits/2026-10-manual-checks.md`.

## Development admin access

Set a local-only token in `.env`:

```env
GUARDIANLENS_DEV_ADMIN_TOKEN=replace-with-a-random-local-token
```

Open `/admin` and enter the same value. This is an explicit temporary gate. It does not satisfy the final Supabase Auth and role-check requirement and must be replaced before production-like testing.

## Supabase setup

Do not disable stub mode yet. First:

1. Confirm proposal P-2 with the supervisor.
2. Create a Supabase project and record the current free-tier limits.
3. Apply migrations in filename order with the Supabase CLI.
4. Verify every table, policy, trigger, and private bucket in a disposable project.
5. Implement `api/repositories/supabase.py` with server-side service-role access and explicit session ownership checks.
6. Add Supabase Auth verification for all `/api/v1/admin/*` endpoints.
7. Add integration tests against a fresh migrated project.
8. Only then set `GUARDIANLENS_STUB_MODE=false`.

The service-role key must remain server-side. Never place it in `NEXT_PUBLIC_*`, browser code, logs, screenshots, or committed files.

## Replacing development stubs with real models

The final active model bundle must contain:

- CLIP consistency thresholds and an SSCD reference-corpus index.
- A TF-IDF (word and character) plus text-cues logistic regression text model. It replaces the XLM-RoBERTa fine-tune planned in the original specification; see [trained model setup](docs/TRAINED_MODELS.md).
- An XGBoost behavioural model and training-only category price baselines.
- Five-fold out-of-fold component probabilities used to train the late-fusion model.
- A sigmoid calibrator.
- Validation-derived Low, Moderate, and High boundaries.
- Reviewed SHAP explanation templates.
- Dataset split hash, seeds, dependency lock hash, component versions, and artefact SHA-256 values.

The API must refuse to render a real band when an active bundle lacks confirmed boundaries. The development boundaries in `ml/configs/dev_stub.yaml` exist only to exercise the interface.

## Open items that still block later gates

- O-1: second annotator.
- O-2: official FYP2 dates.
- O-3: INTI ethics or approval requirement.
- O-4: approved retention period.
- O-5: licences for the exact pretrained weights.
- O-6: current Supabase free-tier limits.
- O-7: validation-derived risk-band boundaries.
- O-8: written record of supervisor sign-off on Chapter 3 sections 3.3.7 to 3.3.9.

See `docs/FIRST_DRAFT_STATUS.md` and `docs/plans/phase-0-first-draft.md` for the exact completion boundary.
