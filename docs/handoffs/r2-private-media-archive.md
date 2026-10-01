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
- Documents operator configuration, limits, remote-only partial outcomes and
  deferred web/CDN integration.

## Evidence

Isolated Fedora validation checkout:
`/home/pkhang/.nanobot/workspace/tdn-r2-validation-20261002`.
Node `24.15.0`, lockfile install, strict backend typecheck: PASS.
Focused archive plus existing image-inspector tests: **11/11 PASS**.
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

## Pending and next action

No real R2 request or upload occurred. Wrangler OAuth is not reused. Dedicated
S3 credentials are missing; owner was asked to create Object Read & Write
credentials for `tdn-media` only without pasting secrets into chat.

Before Fedora activation: review/final-head CI, install the approved release
separately from the active runtime, configure private credentials and authorize
a bounded synthetic live verification. Do not bulk-copy real files or restart
the operator merely to test the optional command.

No UI/CDN, public URL, CORS, lifecycle rule, deletion, migration, business write,
provider collection, historical transfer or live operator change. Automatic
web mirroring and PDF/video support are not delivered by this slice.
