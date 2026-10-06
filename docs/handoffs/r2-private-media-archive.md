# R2 private media archive handoff

Base: `e1e5b7255f817c33e6962c258b1ec23516d8f5fb`.
Branch: `feature/r2-private-media`.

## Completed

- Added an optional explicit-digest archive command, using the official S3 SDK
  pinned at `3.1144.0`, without replacing the local artifact store.
- Reads only a retained active PNG/JPEG with verified manifest, hash and full
  image validation. SQLite opens read-only/query-only; no new SQL writes.
- Creates an immutable-key remote copy conditionally; verifies downloaded
  bytes and MIME on both creation and conflict retry. No delete/list/bulk calls.
- Derives the official account endpoint, uses explicit bucket-scoped S3
  credentials, disables SDK retries and sanitizes errors.
- OWNER-authorized web mirroring copies new logos/photos and generated posters
  after verified local commit. Network work stays outside the database mutex.
- Graceful operator shutdown waits for requests before destroying the SDK.
- Failed copies preserve successful local receipts/previews and report safe
  process-local health status and a sanitized warning. Exact upload/generation
  retry repairs the copy without another business record or AI call.
- Historical backfill and public CDN remain deferred.

## Evidence

Isolated Fedora validation checkout:
`<private path on the test host, withheld>`.
Node `24.15.0`, lockfile install, strict backend typecheck: PASS.
Focused archive plus existing image-inspector tests: **11/11 PASS**.
Web follow-up: strict backend typecheck and focused SDK/HTTP upload/poster,
catalog/package API and operator runtime tests: **28/28 PASS** on Fedora.
Review follow-up: mirror failures are traceable by exact digest in private
logs; a cumulative failure counter survives later successful copies. Explicit
drain also waits for already-started copies whose HTTP client has disconnected before closing
SQLite/SDK. Config/health and drain behavior have focused regression coverage.
Latest Fedora strict typecheck and R2/operator tests: **14/14 PASS**.
Test authoring follows test-audit: the two new HTTP tests own post-commit web
wiring and failure/retry semantics, rather than repeating SDK/image decoding.
The first run exposed a test-server counting error: its failure response
occurred before the PUT counter increment. The counter now observes requests
before responding; assertions and production behavior were not weakened.

No Windows test/build/typecheck. `git diff --check`: PASS.
Dependency audit reports one existing moderate `fast-uri` advisory from the
base AJV dependency; no newly introduced SDK advisory was reported. It is not
silently upgraded as part of this storage feature.

## Changed areas

- `src/platform/artifacts/r2-media-archive.ts`
- `src/modules/flow/retained-media-archive.ts`
- `scripts/archive-media-r2.ts`
- `tests/integration/r2-media-archive.test.ts`
- `package.json`, `package-lock.json`
- task/handoff and status documentation

## Fedora activation, 2026-10-02

Dedicated bucket-scoped S3 credentials were transferred privately to Fedora
without exposing values in chat or Git. Wrangler OAuth was not reused.
The owner authorized web activation and confirmed edits are saved. A bounded
synthetic live check successfully created and byte-verified one 219-byte PNG;
the exact retry verified the same object. No real-data transfer, AI provider
call or authoritative business write occurred. The integrated synthetic web
check also passed using the actual configured R2 client, a separate temporary
database and disposable port 8793. That listener was closed after the check.

Runtime code: `c68e1c9d6a78b06573f9f6c65b29066a1e89c717`.
Release: `<private path on the test host, withheld>`.
Listener: `127.0.0.1:8787`, PID 1193296 at activation. Persistent tmux window
`r2-web` in session `tdn-growth-os-operator-8787`; not a boot-managed service.
Original authoritative database/artifacts and CLIProxy/local OWNER testing
configuration are preserved. No migration was run. Read-only verification
confirmed 105 business rows and all 46 artifacts unchanged, schema 37, safe
health status, UI/assets/read routes and unauthenticated OWNER rejection.

Cold private recovery copy:
`<private path on the test host, withheld>`.
It contains the quiescent SQLite set, artifact tree and verification manifest,
not credentials. Private files remain 0600; directories 0700.

All three CI checks passed on the exact runtime code head:
[repository checks](https://github.com/khangpworking/tdn-growth-os/actions/runs/36953347611),
[report preview](https://github.com/khangpworking/tdn-growth-os/actions/runs/36953347542),
[local OWNER web](https://github.com/khangpworking/tdn-growth-os/actions/runs/36953347567).
Full check: 722 backend and 187 frontend tests passed, contract generation,
typechecks and frontend build passed. Independent Claude follow-up found no
blocking defects. Awaited copies can add up to the bounded 30-second archive
budget to a response; no durable outbox was added. Drain covers already-started
copies; the pre-existing disconnected request/write shutdown gap is not solved
by this feature.

PR #107 remains draft and unmerged. Only the reviewed code head was activated
under the owner's explicit Fedora-local testing authorization. Follow-up docs
commits do not change runtime code. For rollback, stop only the verified current
operator, confirm listener/lock closure, and run the private launcher with
`rollback` in tmux. It restores the prior code against the same data and disables
R2; do not overwrite newer data from the recovery copy or delete remote objects.

No UI redesign, public CDN/URL, CORS, lifecycle rule, deletion, migration,
provider collection or historical transfer. PDF/video support, R2-primary
storage and recovery downloads are not delivered by this slice.
