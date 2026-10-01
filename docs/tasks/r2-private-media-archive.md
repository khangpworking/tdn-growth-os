# Private R2 media archive foundation

Owner request: apply the provisioned private `tdn-media` bucket to TDN. This
first slice explicitly copies one retained PNG/JPEG at a time. It is not a CDN
rollout, automatic web mirroring, a database backup, or a storage migration.

## Accepted boundaries

- SQLite and local content-addressed artifacts remain authoritative.
- No new migration, business record, UI, public URL, CORS, Worker or domain.
- Only an explicitly selected active retained image, fully validated with the
  existing Content Studio image inspector and manifest reader, up to 8 MiB.
- R2 key: `tdn/v1/media/sha256/<first-two-hex>/<exact-sha256>`.
- Conditional create; an existing object is never overwritten. Download and
  verify actual bytes and MIME after creation or exact retry. ETag/metadata
  alone are not integrity proof. Account administrators can still modify R2;
  this is not an object-lock/WORM guarantee.
- No list, delete, automatic retry, bulk upload, local deletion or read fallback.
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

No scheduled job calls this command. Real-data uploads, historical transfer,
PDF/video support, retention/deletion policy, automatic web copies, recovery
downloads and CDN exposure require their own scoped activation.

## Validation plan and risk

Production target: Fedora Node 24.15.0. No Windows tests. Four focused tests
exercise the actual AWS SDK against a disposable loopback S3-compatible
server: conditional writes and byte replay; bounded inputs/safe failures;
retained-image eligibility and zero local mutations; opt-in configuration.
Existing image tests own decoder semantics, so those are not duplicated here.

No real bucket/provider call is required for offline validation. Review before
activation; rollback consists of not invoking the optional command. Existing
operator behavior is unchanged. An R2 copy alone cannot restore SQLite lineage.

Official references: [SDK configuration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/),
[S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/),
[bucket-scoped credentials](https://developers.cloudflare.com/r2/api/tokens/).
