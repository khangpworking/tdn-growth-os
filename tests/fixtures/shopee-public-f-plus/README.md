# Fresh F+ scenario baseline

Generated from revision `2db225d22c52dbd1213b68673302d19a77a3749d` with
`tests/helpers/generate-shopee-public-main-baselines.ts --candidate`.
This pins current-code F+ presentation and its artifact digest references.
Only the trial scenario changes relative to the merged G-references fixture.
The independent main and G-references fixtures remain unchanged.
Both S9 fresh output and enabled/disabled same-code replay keep exact package
membership and byte comparisons, including all source and runtime records.

UNIT-209: trial-run entries regenerated with the same generator (`--candidate`, output outside the checkout).
Only the current-reader Market unit wording and retained Phần 11 revenue table changed (C4/C5/C6/C8); every other scenario is byte-identical.
The revision field keeps the F+ base revision that the S9 test pins.

Q3 owner rules: only the trial Market 1.4 reader, its HTML-bound input/claims,
and their revision-row digests change. The reader adds table 1.1, comparison
notes, sales-average labels and calculation notes; claims add U13_METRIC_CODE,
U13_REAL_PRICE and L20_RANKING_WORD. All 283 other members remain byte-identical,
including source replays, Insight and capture-row JSON. Membership stays at 288 entries.

v3plug P1: trial-run entries regenerated with the same generator (`--candidate`, output outside the checkout).
Only the auto-run pick record changes: `autorun-pick-record-v2` adds `capture` (applied keywords and Smart query).
It is content-addressed, so one member is renamed (`0457f4ce…` -> `f7a3a228…`); all 287 other members stay byte-identical.
Membership stays at 288 entries. The revision field keeps the F+ base revision that the S9 test pins.

v3plug P2: trial-run entries regenerated with the same generator (`--candidate`, output outside the checkout).
Only the auto-run pick record changes: `autorun-pick-record-v3` adds `scope` (category decision and keyword-2 evidence; this synthetic capture has neither).
It is content-addressed, so one member is renamed (`f7a3a228…` -> `9c3fff9e…`); all 287 other members stay byte-identical.
Membership stays at 288 entries. The revision field keeps the F+ base revision that the S9 test pins.
