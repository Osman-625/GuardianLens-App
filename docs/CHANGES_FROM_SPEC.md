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

Open items that are unchanged: the retention period (O-4), the ethics workflow (O-3), and the user study, which waits.
