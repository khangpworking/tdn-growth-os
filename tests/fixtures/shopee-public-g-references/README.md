# Fresh G-references scenario baseline

Generated from merged revision `ae561389ae9c74d882b1ff8195ce0ba455b9fb94`
plus the reviewed `plainCaptureNumbers` wording fix
with `tests/helpers/generate-shopee-public-main-baselines.ts`, using
`--candidate` and an output directory outside the repository. The manifest's
`revision` records that base plus `+wording-fix`; file entries and
archive bytes are the generator output without modification.

Independent main `e9e0f444` reproduces every member of `shopee-public-main`.
The merged scenario changes the trial Market render, its technical HTML copy
and their digest references (contract M20, M21, L1 and L2). The wording fix
also changes the freshly built trial capture reader and its digest references.

Both S9 fresh-generation and replay tests use this current-code baseline.
Replay also compares enabled and disabled generation directly, including every
package member's exact bytes. Factory and transport assertions remain in place.
The historical `shopee-public-main` fixture stays unchanged as independent
main-output evidence.
