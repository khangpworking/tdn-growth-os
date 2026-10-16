# Independent fixture provenance

Model: GPT-6-astra
Date: 2026-10-08

Basis: task-provided source excerpts and vocabulary only. Initial fixtures were generated from the paraphrased briefing and then checked against the verbatim excerpts supplied in conversation. No shapes were supplied or viewed. No filesystem files, configurations, source documents, README, AGENTS, or other worktrees were read. Tools were used solely to write these literal artifacts in the assigned directory. No provider calls or keys were used.

All 12 expected verdicts and TTL datasets are frozen exactly as returned before implementation results were available. Six expected verdicts are true and six are false. A true verdict means validity within the assigned bounded metadata projection; it does not certify compliance with the entire source rule. Fixtures are synthetic only.

## Limitations and discrepancies

- E4: the vocabulary does not represent x/y group size, placement of the unverified flag at the start of the persona, self-reported demographics, or links between each author and evidence. The quotes are synthetic fixture data, not authenticated customer statements.
- L10: cases check source type and inclusion or exclusion of comments only. The vocabulary does not represent public visibility, a separate store-account category, exclusion reasons, placement of labels beside quotes and counts, author counting within a platform, or sample-size wording.
- E12: cases do not check publication date, geographic scope, narrowest statistical group, subsequent-period updates, consistency with source files, or interpretation restrictions. They use spreadsheet traces and do not test the PDF branch.
- E13: cases do not check unrepresented E12 obligations, independence of sources, disclosure of discrepancies, calculation methods, currency units, or estimate notes. Indicator name and code are synthetic.
- UNKNOWN: the verbatim decision requires retaining fresh UNKNOWN records for inspection and separate disclosure but does not name that retained set ALL. The inAll=true mapping comes from the initial task briefing. The vocabulary does not represent freshness, distinct missing/stale/pending states, CORE membership, or an explicit wideUnknownPolicy in version-bound inputs.

No humanizer skill was invoked or claimed. No validation against implementation shapes was performed by this independent author.
