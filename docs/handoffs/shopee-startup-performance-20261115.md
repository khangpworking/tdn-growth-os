# Handoff — Shopee startup performance (F576)

Updated: 2026-11-15
Worktree/branch: `~/lanes/shopee-startup-performance-20261115`, `perf/shopee-startup-20261115`
Base: `e63fce3baebb0c76e7bdb41dc93e25ac4dd9d9fe` (tree `1b348e42bce6a2c4e3b6eeafe47f489f951c279e`)

## Scope and measured cause

Frozen product source is `tools/shopee-desktop/tdn_shopee_transport.py` only;
`tdn_shopee_app.py` is unchanged. The owner test file is owned by secondary.
No business-logic, security, deadline/bound or timer changes were made.

Measured root cause (Root, actual Windows, three fresh processes, same
config/caps): cold `Api.connection` median 4.036 s = physical PowerShell
inventory 2.420 s + `ssh-keyscan` 1.236 s + native SSH 0.359 s; immediate warm
0.347 s (inside the 0.75 s candidate cache). The cold path enumerated the
physical adapter before verifying any known/pinned endpoint, and `ssh-keyscan`
fetched every key type by default although only one configured algorithm family
can ever match.

Two minimal changes in `tdn_shopee_transport.py`:

1. `find_candidates` tries the cached active endpoint and the explicit
   seed/name candidates first; the physical adapter inventory
   (`_refresh_scope_locked` / PowerShell) runs only when known discovery finds
   nothing and LAN fallback is enabled. The half-wall known-phase split, the
   post-inventory deadline check, scope-change invalidation and the LAN sweep
   are unchanged on the fallback path. A cache younger than 0.75 s is still
   returned directly, so the warm path is unchanged. Known-host verification
   before physical fallback is the accepted ordering.
2. `_verify_target` passes `-t <family>` to `ssh-keyscan`, mapping the
   configured `hostIdentity.keyType` to the only accepted families
   (`ed25519` / `ecdsa` / `rsa`). Exact key-type/blob/digest comparisons, the
   `-T`/`-p`/address arguments and configured identity semantics are unchanged.
   `rsa-sha2-*` still maps to the `rsa` family and still cannot match a keyscan
   `ssh-rsa` line; that pre-existing alias behavior is deliberately unchanged.

Preserved invariants: exact canonical app-private pin and strict SSH flags
(`StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, `HostKeyAlias`,
`HostKeyAlgorithms`, hidden children); no skipped verification, no unverified
persistence, no broader candidates; all global/SSH/probe deadlines and LAN
bounds unchanged; current physical-source LAN fallback, singleflight/backoff,
generation invalidation, one-shot action/export and legacy behavior unchanged.
Deliberate consequence: an active endpoint that still pin-verifies does not
trigger a scope enumeration, so a scope change is noticed only when LAN
fallback runs; stale-LAN recovery is retained and proven below.

## Frozen hashes

- `tools/shopee-desktop/tdn_shopee_transport.py` — `dc220c56a8fad4232142427ff6a268c56eaa8c507be655aab88717068f6af95a`
  (baseline `da5d14fd22249407c8d9fedbdc37afda8a9a74aa7e0f42a7847bedec5669b8d7`)
- `tools/shopee-desktop/tdn_shopee_app.py` — `1329dfc372596b534659cb917c5a30c3633f68f3afa8e94fae317724eb4a7ac9` (unchanged)
- `tools/shopee-desktop/tests/test_connection_recovery.py` — `7fc35ae9ef21c3530e9bf11bae8e8f93c34c984373392ed258de8683223343ea`
- `docs/handoffs/shopee-startup-performance-20261115.md` — this file

## Evidence (raw logs outside Git)

- Native owner suite: 20/20 OK in 1.349 s — `f576-final-focused20.log`,
  sha256 `1c8c58cafd099a7684fb1d5afeeb04a69fd54c8767a26140b059d99135bc94e5`.
- Full desktop suite: 71/71 OK in 13.983 s — `f576-final-full71.log`, sha256
  `e7868e84c4758393ecbfacd58efc9215f87d9cdf803457a8de52eb8fbe2360f4`;
  bindings sha256 `6d428f6cace095d5027d8812d2f14f20fdf8130760d2dffb3de7e2234be2f5d9`.
- Intended immutable-baseline RED on `da5d14fd…`: `f576-red-baseline.log`,
  sha256 `44746c6d20897d4442294dbba1c221f24842dafc8f643ac7c3f52b2ca02503f7` —
  fake inventory 2.4 s is not below the 2.0 s bound at the canonical cold-known
  API regression.
- Actual Windows (Root), same three fresh processes / config / caps: baseline
  median cold connection 4.0362342 s → candidate 1.4721949 s, a 63.5255 %
  reduction of the connection stage only; every healthy case reports
  `scope_reads = 0`; warm 0.364 s. Candidate profile raw sha256
  `2fe835790571f41a9d3261bad5b1839a8f4569a61f49d88840e61cbeb1de6944`.
- Actual Windows controls: stale-LAN recovery 5.416 s and warm 0.340 s with no
  rescan; valid alternate ed25519 wrong-pin 1.129 s returning exact
  `HOST_IDENTITY_MISMATCH` with 0 SSH calls. Config, private and global pins
  unchanged; all actual SSH strict and hidden; 0 source/provider/production
  writes.
- Native UI availability was observed with three coarse captures at 1.332 s
  (window), 3.319 s (form) and 8.319 s (usable); usability lies in
  (3.319 s, 8.319 s], not an exact ready time and not an OS/reboot cold
  measurement.

## Remaining

Final packaged desktop candidate UI/cutover and CI remain with Root/Sol. No
further runtime, test or doc edits; no suites rerun; no push/PR/merge/deploy
or provider/production calls by agents.
