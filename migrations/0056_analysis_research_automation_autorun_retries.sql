-- Owner "Thử lại" requests for a stopped Market auto-run capture (P6-209
-- follow-up, PR3). One row per accepted retry, keyed by the owner's request key,
-- so an exact retry of the same request returns the same receipt without a second
-- reset. The run request ledger only admits START/CONFIRM/CANCEL, so the retry
-- keys live here. A row exists only for a run that already has an auto-run row.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE research_automation_autorun_retries (
  request_key TEXT PRIMARY KEY NOT NULL CHECK(length(request_key) = 36),
  run_id TEXT NOT NULL REFERENCES research_automation_autorun(run_id) ON DELETE RESTRICT,
  retry_number INTEGER NOT NULL CHECK(retry_number >= 1),
  stop_code TEXT NOT NULL CHECK(length(stop_code) BETWEEN 1 AND 64 AND stop_code NOT GLOB '*[^A-Z0-9_]*'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  accepted_at TEXT NOT NULL CHECK(
    julianday(accepted_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', accepted_at) = accepted_at
  ),
  UNIQUE(run_id, retry_number)
) STRICT;
