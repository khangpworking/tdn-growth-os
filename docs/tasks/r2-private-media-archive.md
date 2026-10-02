# Private R2 media archive foundation

Owner request: apply the provisioned private `tdn-media` bucket to TDN. This
first slice copies retained PNG/JPEGs. Follow-up owner authorization on
2026-10-02 enables private web mirroring of new Content Studio uploads and
generated posters. This is not a CDN, database backup, or storage migration.

## Accepted boundaries

- SQLite and local content-addressed artifacts remain authoritative.
- No new migration, business record, UI, public URL, CORS, Worker or domain.
- Only an active retained image selected by an exact successful upload/poster
  receipt or the explicit command, fully validated with the
  existing Content Studio image inspector and manifest reader, up to 8 MiB.
- R2 key: `tdn/v1/media/sha256/<first-two-hex>/<exact-sha256>`.
- Conditional create; an existing object is never overwritten. Download and
  verify actual bytes and MIME after creation or exact retry. ETag/metadata
  alone are not integrity proof. Account administrators can still modify R2;
  this is not an object-lock/WORM guarantee.
- No list, delete, automatic retry, bulk upload, local deletion or read fallback.
- Web copying starts only after local commit, publication and verified replay,
  outside the database mutation mutex. It is awaited within the request, not
  a detached task. Graceful shutdown drains requests before closing the SDK.
- Upload and exact generation retries can repair a failed remote copy without
  creating another business record or calling AI again. There is no durable
  queue: a process crash before copying requires an explicit retry.
- R2 failure leaves the local application unchanged. An interrupted upload
  may already exist remotely; rerun the same digest to verify it safely.

## Configuration and activation

Use a separate R2 S3 credential scoped to Object Read & Write for `tdn-media`.
Wrangler's OAuth login is not application S3 authentication. Do not inspect
or reuse Wrangler credential files. Store secrets outside Git, mode 0600, and
pass them to the command via its process environment, never arguments/chat.

Required environment: `TDN_R2_ENABLED=true`, `TDN_R2_BUCKET=tdn-media`,
`TDN_R2_ACCOUNT_ID`, `TDN_R2_ACCESS_KEY_ID`, `TDN_R2_SECRET_ACCESS_KEY`.
Endpoint is derived from the validated account ID, not an arbitrary URL;
region is `auto` regardless of the bucket's APAC location.

```sh
npm run media:r2:archive -- /absolute/tdn.sqlite /absolute/artifacts <exact-image-sha256>
```

The command opens SQLite read-only/query-only and closes all handles. Success
reports `copied` or `verified_existing`; output is not a business approval.
It sends at most one PUT and one verification GET. SDK retries are disabled,
and each operation has a bounded timeout. A successful PUT followed by failed
verification reports failure, not a verified archive receipt.

No scheduled job calls this command. An OWNER-enabled operator with the same
five environment fields mirrors new logo/photo uploads and generated posters.
The successful local receipt remains successful if R2 fails. A sanitized log
warning and `/healthz.mediaArchive.lastCopy` report `failed`; `verified` means
the last completed copy passed download verification, not that all historical
files are archived. `failedCopyAttemptsSinceStart` is cumulative, remains
visible after a successful copy, and is not a count of unresolved images.
The private log records the exact failed digest for the repair command.
Status is process-local and resets to `not_attempted` on
restart. No credentials, endpoints or object paths are exposed there.

R2 cannot be enabled on a read-only operator. Browser previews keep using
verified local API routes; no browser S3 key, public URL or CORS is needed.
Historical transfer, PDF/video support, retention/deletion policy, recovery
downloads and CDN exposure remain separately scoped future work.

## Validation plan and risk

Production target: Fedora Node 24.15.0. No Windows tests. Four focused tests
exercise the actual AWS SDK against a disposable loopback S3-compatible
server: conditional writes and byte replay; bounded inputs/safe failures;
retained-image eligibility and zero local mutations; opt-in configuration.
Existing image tests own decoder semantics, so those are not duplicated here.

Two additional real HTTP tests own web wiring: authorization/validation before
copy, local success on remote failure, exact retry repair, verified previews,
and exact generated-poster copying with zero additional AI attempts on retry.
Existing SDK tests own remote integrity; existing image tests own decoding.

No real bucket/provider call is required for offline validation. Review before
activation. Deploy a separate pinned Fedora release, take a quiescent private
SQLite/artifact recovery copy, preserve all existing configuration and data,
then start with privately loaded S3 credentials. Rollback uses the old release
and the same authoritative data, with R2 disabled. Existing remote copies are
not deleted. An R2 copy alone cannot restore SQLite lineage.

Official references: [SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/),
[S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/),
[bucket-scoped credentials](https://developers.cloudflare.com/r2/api/tokens/).
