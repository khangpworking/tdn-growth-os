# Insight two-defect regression: execution evidence

Owner authorized steps 1 and 2 on 2026-10-05. Execution and independent semantic
audit are complete. Both targeted defects are FIXED_IN_THIS_RUN; no new confirmed
semantic defect was found within the bounded audit. This is not production or
business acceptance.

## Execution

| Batch | Records | Execution | Transport time | Structural gates |
| --- | --- | --- | --- | --- |
| B1 | 5, 6, 13, 19, 23 | e6725282-41ee-43c9-8c12-6c98eef62bec | 123,705 ms | All passed |
| B4 | 52, 54, 56, 59, 61 | 552c2854-6de8-409e-9a73-6f568242a794 | 169,745 ms | All passed |

Configured provider/model: CLIProxy / `gpt-6.1-sol`.
Two new transport attempts, sequential, no retry. Cumulative budget: **7/8**.
Provider billing: **UNKNOWN**, not inferred from elapsed time.

Both executions retained the exact expected prompt, batch input and configuration.
Candidates passed the canonical digest, pointer/membership and PENDING_AI
provenance checks. No acceptance receipt was created. Structural VALID does not
establish semantic acceptance.

## Isolation and identity

Fedora scratch:
`~/.cache/tdn-insight-regression-20261005-p6TR5L`

Owner-only local audit folder:
`%USERPROFILE%/.codex/private/tdn-insight-pilot-20261004/two-defect-regression-20261005`

The whole backend src, canonical contracts and migrations were compared with
the preceding benchmark snapshot. Only the repaired prompt source differs.
All 47 migration checksums match the copied database ledger. The new prompt
is pinned before transport by production-service stub capture, not by source
inspection alone.

Initial preparation stopped before networking because of an unrelated PageIndex
file in the available source snapshot. A new isolated copy was made from the
old benchmark snapshot and overlaid with only the repaired prompt source.
The failed preparations made zero model calls.

Old benchmark database and artifact tree remained byte-identical after the
new executions. All three prior call ledgers remained unchanged. Benchmark
runner processes exited. Fedora scratch directories are 0700 and retained
private input/database files are 0600. Windows retained inputs inherit only
Admin and SYSTEM full-control access.

## Retained bindings

- Frozen spec: `6556b3cb63892cc08f8bb11e5cc48d553e6e09423e7d642327e4fe68a540c002`.
- Zero-network preflight: `43ec1a5dfd4151d6aadd61d0b89caa1eabe1dd1dac1d6cb0821b2c82d895adf7`.
- Settled call ledger: `bb4783206cadbd1b20ddf6f03bce354a14dbbabd817839435bff4cfb564087c0`.
- Retained audit binding file: `26df38cdae9c7d08fafa501debab75c7c33ef61503ebf1fa49b2b6eb2b69b005`.
- Prompt: `e7a1881bce8f969365f90d321b5e7115a9cb15d0a4d22d00f6c58cdd6b2209a2`, 28,216 bytes.
- B1 input: `e2cd09f7dc409e6e4ef55db7751b6fdbd516ac404747010d754c98c02c13028f`.
- B4 input: `e7c68aad77fbd36ec1260dd4f186fccf783a877352d717db1ce56edcb02ba8c6`.
- B1 canonical candidates: `322af664980273fde0a82e88fdef6df3737a207807a53f03435db5a60d83e219`.
- B4 canonical candidates: `b95763f708bc79528d7f62af702d55a39d7a7a1544055a7c8c5d2f7de7615b7f`.

All six local retained prompt/input/candidate files were rehashed and their
byte sizes matched the Fedora retained bindings. Pretty-print copies are not
the canonical artifact bytes; the `retained-*.json` files are authoritative.

## Semantic review and limitations

The **Review marketing framework files** session confirmed criteria before
dispatch and audited both complete retained artifact sets independently.

| Finding or control | Final scoped conclusion |
| --- | --- |
| S01: R52 original stated task | FIXED_IN_THIS_RUN, source-located I02 task; no invented actor or completed transaction |
| S02: R19 boilerplate context | FIXED_IN_THIS_RUN, irrelevant context excluded while raw source and membership remain |
| R23/R52 negatives | Preserved, no positivity reversal |
| R54 disputed completion | Reported claim and contrary evidence retained; actual delivery unresolved |
| R61 temporal order | Source-local order retained, no verified-person journey or safety inference |
| Qualifiers/conditional intent | Preserved without promoting future buying into completed buying |
| I10 membership/occurrences | 24 record-code pairs and 26 occurrences across these ten records; restricted old/reference inventories match |

The audit checked 126 exact source spans and 89 provenance objects, with zero
violations. Changed enclosing spans and lower I09 row totals were assessed as
valid conservative alternatives rather than failures by count. All 18 I09 rows
remain partial current-state inventory, not evidence of unmet needs. Empty
I07/I08/I13 arrays do not establish positive coverage or accepted absence.

One old scoped business question remains: R54 reported-basis attribution can
stay UNKNOWN when the actor is omitted; OTHER_REPORTED may be a defensible
alternative. The AI-assisted reference cannot mandate it. This does not block
closing S01/S02, and was not silently resolved or turned into acceptance.

Private independent audit files:

- `semantic-audit.md`: `b74ab1936b6d95011a9529b57aaeb4a37d6cbd0b24f64699e288cf38e52028d7`.
- `semantic-audit.json`: `c7ed22d948a6dc357f3f05509143c6be902dccd644b48b33ea1708ff26558818`.

The coordinator independently rehashed both audit files and verified all 30
file bindings (hash and byte size) listed in the JSON audit, with no mismatch.
This is a file count, not a section-acceptance count. The business audit
verified local source-packet equality and retained bindings; it did not rerun
the remote service or independently certify remote database state.

Assessment is a known-development-data regression check of S01/S02 plus their
controls. It is not held-out accuracy, human-gold annotation or acceptance of
all 30 sections. B2/B3 were not rerun under the new prompt and cannot be combined
with these executions to claim complete new-prompt coverage. No interpretation
was accepted, no live business record was changed, and no report was regenerated.

No deployment, merge, migration, source collection, Jev call or Windows project
test run occurred. Raw private inputs, model outputs and quotations stay outside
Git. Next step is a separately scoped new-data evaluation to test generalization
and previously unevaluable positive families, not another tuning-data rerun.
