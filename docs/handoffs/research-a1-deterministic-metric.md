# Research A1 implementation handoff

Base: `cfb234a7de8707256a86169b80af6497998966ab`. Branch: `feature/research-a1-deterministic`.

## Delivered

Closed normalized-input/output schemas and generated types; pure Box 2 calculator; actual offline CLI; private deterministic JSON/Markdown bundles with exact verified reuse and overwrite refusal. Source pointers, profile, acquisition/measurement times, codebook, fingerprint and method/renderer/rounding versions remain explicit. No AI or raw-source verification is claimed.

Business methodology was coordinated with **Review marketing framework files**. Its independently calculated fixture passed. Its read-only review accepted methodology and requested unitsDelta/completeness, which was incorporated. The UNKNOWN inclusion policy is required profile input, not a silent default or owner approval.

## Local evidence (Node 24.15.0, Windows)

- Focused new calculator/actual CLI tests: 7/7 pass.
- Direct strict backend TypeScript across src/contracts/tests/scripts: pass. Canonical schema generation: pass (83 contracts), existing generated contracts have no semantic diff.
- Frontend typecheck/build: pass; frontend tests: 125/125 pass. No frontend code changed.
- Repository backend suite: 370/387 pass, 17 fail on this Windows host. All 17 failure names reproduced in the unchanged matching baseline files in the clean PR50 integration checkout: 50/67 affected baseline tests pass, 17 fail. This is not a green full-suite claim.
- Failures cover existing Windows-incompatible file modes, directory fsync/symlinks, operator/static checks and a protected-file byte hash. The owner-api failure was inspected directly: group/other permission assertion (54 != 0). Existing tests were not weakened.
- `npm run check` stops at the existing Windows typecheck wrapper; the same TypeScript options were run directly successfully. Fedora/Linux full check and permission assertions remain required release evidence.

## Synthetic CLI artifact

A five-row synthetic bundle was generated outside Git. Input digest `07e3404e03ebbde390b122bd1777d15018b2435398f29d377e55433c3586b4fb`; result file SHA-256 `2251474cbf2e3f17378693621c046541bf2a44fd72b8f1ec2020a0cac5e3d44c`; report SHA-256 `7ff0017a09a0649516203b6ef28684fac66bd24b3bf886d12a4f91361c327989`. No private market data is in the fixture or Git.

## Integrity and limitations

No migrations, dependency versions, lockfile, CI, Content Studio, domain services, running operator, real database, source workbook or private evidence corpus changed. Shared integration changes are only the new package command and two generator registrations; coordinate those lines with Content Studio 049 when landing. No deployment, live collection, provider calls or approval actions.

A1 is not the complete Market/Insight pipeline. A2 must verify raw workbook cells and normalized mappings; A3 must add workspace-bound persistence/report identity and evidence-backed claim packaging through existing Box interfaces. This CLI bundle is not an authoritative report approval record. A missing/corrupt/incomplete existing bundle fails rather than regenerating; crashes can leave incomplete files for explicit operator recovery. No automatic orphan cleanup.

No load/stress/browser tests added: test-audit selected the calculator owner and one real CLI boundary, with independent business expectations and meaningful edge cases. Linux CI/PR status must be reported from actual final-head results, not inferred from this handoff.
