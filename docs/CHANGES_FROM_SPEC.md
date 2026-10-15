# Where the build differs from the specification

Written 2026-10-15. The documents in `docs/spec/` are the supplied pre-implementation specification and are kept as supplied. This file lists where the code now differs from them. The full documentation update waits until development is finished.

| Area | Specification | Now |
| --- | --- | --- |
| Storage | Supabase Postgres with RLS, buckets, a research schema and a hold-out trigger | One SQLite file, `data/guardianlens.sqlite3` (`api/repositories/assessments.py`). Only the scrubbed title, the structured inputs and the result are stored. The description, the raw wording and the photos are never written. |
| Admin | Admin page, bundle list, record list, CSV export | Removed, with the admin token and every Supabase key. The research data is read from the SQLite file with any SQLite tool. |
| Browser extension | Out of scope | Added, approved by the supervisor on 2026-10-05. It reads one listing only when the buyer clicks. |
| Text model | XLM-RoBERTa fine-tune | TF-IDF word and character features plus text cues with logistic regression (the XLM-R run collapsed). |
| Behavioural signal | Plain seller-risk explanation | The card states that the model learned "has a full seller profile", which in the annotated data mostly separates the two marketplaces, so a good profile does not mean a safe listing. |
| Language gate | Chinese-dominant text refused | Text mostly in any non-Latin script (Chinese, Tamil, Thai, Arabic and similar) is refused. |
| Latency evidence | Harness in `ml/` | `scripts/time_checks.py` times real checks over HTTP. The server warms its models at start-up so the first check is not slow. |
| Typeface | Inter, named in the styles but never loaded | Public Sans, bundled with the website and the extension (Chrome blocks remote fonts in an extension). The design direction and the choice are recorded in `.impeccable.md`. |
| Reasons | A general sentence per feature | Each reason states the listing's own value ("The seller rating (4.8) raised this signal's risk estimate"), with plain numbers ("1 day", "1,500,000"). |
| Seller page text | Not specified | The number patterns in `extension/lib/capture/seller.ts` run in linear time. A page of 100,000 digits used to freeze the panel for about 100 seconds; the slowest input now takes under 0.3 seconds, pinned by a test. |
| Request time limit | Not specified | The API client ends a request that gets no answer (30 seconds, 120 for the photo upload) and treats it as "could not be reached". The panel tries a lost request up to three times, then shows a failure, so a hung server cannot leave it spinning. |

Open items that are unchanged: the retention period (O-4), the ethics workflow (O-3), and the user study, which waits.
