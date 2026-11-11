# Ontology: use cases and maintenance

Updated: 2026-10-08 · Tool: [Open Ontologies](https://github.com/fabio-rovai/open-ontologies) 2.0.1 on Fedora · First experiment: ONTO-1 (PR #173, folder `ontology/`) · Setup: [wiki-and-ontology.md](wiki-and-ontology.md)

Everything here is **proposed**. The use cases are suggestions, not tested ones, and the SPARQL and SHACL snippets are sketches. ONTO-2 exercised sections 3.3–3.5 with a throwaway rule and a simulated change; see `ontology/results/2026-10-08-guide-exercises.md`. UC-1/2/4/5/6 remain proposals.

## Tóm tắt (cho chủ shop)

Ontology ở đây là **bộ kiểm tra phụ**, không phải một phần của app. Nó giúp phát hiện hai loại lỗi mà test code khó bắt:
- tài liệu và dữ liệu mâu thuẫn nhau (danh mục nguồn nói một đằng, bảng section nói một nẻo);
- đầu ra của báo cáo thiếu nhãn, thiếu nguồn hoặc vi phạm quy tắc cấu trúc.

| # | Use case | Việc | Nên làm | Tốn model |
|---|---|---|---|---|
| UC-1 | Kiểm nhất quán tài liệu | Quét danh mục nguồn, bảng 30 section, rule, gói việc xem có lệch nhau không | Làm trước | Không |
| UC-2 | Kiểm bảng "số liệu đã dùng" | Mỗi số trong báo cáo có nguồn, hạng, nhãn đúng không | Làm cùng gói P6 | Không |
| UC-4 | Phân tích tác động khi đổi rule | Đổi một rule thì chạm section, gói việc và file nào | Làm sau UC-1 | Không |
| UC-5 | Phân loại nghĩa từ khoá (L9) | Mô hình hoá khái niệm dễ nhầm như thạch dừa, thạch dứa | **Chưa nên** | Không |
| UC-6 | Suy luận | Suy ra quan hệ từ phân cấp | Chỉ làm cho một việc hẹp | Không |

Quy tắc dùng: kết quả "qua" nghĩa là *shape này chặn đúng những dữ liệu sai mà người viết nghĩ ra*, không có nghĩa là *rule đúng*. Mọi shape giữ trạng thái "đề xuất" tới khi được review. Chưa nối vào app, chưa đăng ký MCP, chưa dùng dữ liệu thật.

---

## 1. What it is, and what it is not

- A set of RDF/Turtle files: **shapes** (SHACL constraints) and **datasets** (the things to check). The tool loads them and reports which shapes a dataset violates.
- Source of truth for business rules stays `docs/research/ultimate-method/ultimate-method-30-sections.md`. A shape is a *translation* of one rule; it never replaces the rule. When they disagree, the Ultimate file wins and the shape is fixed.
- It checks **structure and consistency** (counts, required fields, allowed values, relations between records). It does not read meaning, verify that a quote is genuine, or compute numbers.
- Not wired into the app, the report pipeline or the CI gates. Nothing in `package.json` changes.

## 2. Use cases

### UC-1 Consistency of the documents (do first)

**Goal.** Catch drift between documents that describe the same thing. Many were edited by hand in a short time, so a missed spot is likely.

**Input (already tables).**
- Source registry `docs/research/ultimate-method/input-data-sources-30-sections.md`: IDs S01…, tier A–D, representativeness, status, cost, and the section matrix (§3).
- The Ultimate file: the section table (§3), the rule list (E1…E14, L1…L10, rules 1–9) and which rule amends which.
- `docs/tasks/research-batch-2-packages.md`: packages P1…P10 and the source IDs they mention.
- `docs/tasks/ultimate-v1.11-tdn-sync-plan.md`: the B1 table of source-board cards.

**How.** A small script (to be written, `ontology/build-doc-graph.py`) reads these tables and writes Turtle into `ontology/data/` (generated; do not hand-edit). Questions are SPARQL files in `ontology/queries/`; consistency rules are shapes in `ontology/shapes/docs/`.

**Example checks.**
- A source whose status says "không dùng được" or "không đạt" appears in a section's source list.
- A tier-D source appears under "Tên trong báo cáo".
- A section has no primary source.
- A package checklist mentions a source ID that is absent from the registry.
- An approved source has no card in the source-board table (B1).
- A rule is amended by an exception, but the amending exception is not mentioned in the amended rule's text (for example E8 and E14).

Sketch (untested):

```sparql
# sections that list a source the registry marks as not usable
SELECT ?section ?source WHERE {
  ?section tdn:usesSource ?source .
  ?source tdn:status tdn:NotUsable .
}
```

**Value.** Cheap (data exists), immediate (a list of mismatches), no dependency on any package.
**Limits.** It sees IDs and relations, not the wording. A table that is renamed or re-formatted breaks the script, so the script must fail loudly on an unknown layout instead of guessing.

### UC-2 The "numbers used" ledger of a report

**Goal.** Validate the table that lists every number in a report with where it came from (planned in package P6-08: section, key, rendered text, value, family, precision, source sha plus pointer, formula, capture time).

**How.** Convert one exported ledger (JSON) to RDF with a fixed mapping, then run shapes.

**Example checks.**
- No number has a source of tier D.
- A tier-C number carries the label "ước tính" (rule E1).
- An official figure has the exact attribution text, a value status (ước tính, sơ bộ, chính thức) and a file, sheet and row trace (E12); World Bank figures also have the indicator code, year and update date (E13).
- No derived number combines values from the two number families ("toàn kết quả tìm kiếm" and "trong mẫu") except the one allowed coverage ratio.
- A shown count from unreviewed coding carries the draft label in the same sentence (L3).
- Persona minimums (E4) and comment exclusions (L10): already the ONTO-1 shapes.

**Prerequisite.** The ledger does not exist until P6-08 is built. Until then, test on a synthetic ledger with the same fields.
**Limits.** It proves the ledger is complete and labelled. It does not prove a number is right or that its source says that.

### UC-4 Impact analysis when a rule changes

**Goal.** Before changing rule X, list the sections, packages and files it touches.

**Layers.**
1. rule → sections: `ontology/data/rule-applies-to.csv`, written by hand from the Ultimate file (for example E12 applies to M02, M05, M06, M08, M09, M10, M13, I02, I03, I12).
2. section → packages: from the packages and sync-plan documents.
3. package → owned paths: from the "Owned paths" lines of each package.
4. paths → functions: not in the ontology; use CodeGraph (`codegraph explore`) from the file names.

**Example question.** "I change L10: which sections, which packages, which files?"

**Maintenance cost.** Layer 1 is hand-maintained and must change in the same PR as the rule. A shape checks that every rule ID that appears in the Ultimate file has a row.
**Limits.** The answer is only as good as the CSV. It is a pointer, not a proof of full impact.

### UC-5 Meaning of keywords (L9): not now

**Idea.** Model confusable concepts ("thạch dừa", "thạch dứa", "thạch rau câu nước dừa", "thử thách") as disjoint classes with their terms, so a machine can classify and the keyword and exclusion lists can be checked.

**Why not now.** Rule L9 already works with plain, versioned keyword and exclusion lists (sync-plan U-12). A table does the same job. An ontology adds value only if all of these hold:
- there are many categories with a real hierarchy (category → group → product);
- several categories share confusable terms;
- the lists are getting hard to keep consistent by hand.

**If done later.** Keep the L9 lists as the source and let the ontology only **validate** them: every exclusion term points to a confusable concept, no term is both keyword and exclusion in the same category, and diacritics are never stripped (so "dừa" and "dứa" stay different).
**Do not** let an ontology choose which records count. That stays with the L9 filter and its recorded exclusions.

### UC-6 Reasoning: one narrow use only

**What reasoning does.** From declared facts it derives facts that follow (subclass and subproperty rules). It does not understand text, infer customer behaviour or judge a claim.

**The one justified use.** Ultimate §6.4 asks for the *narrowest official statistics group that contains a product category*. Model the category hierarchy and the statistics hierarchy once; a query then returns the narrowest group and whether the category falls between two groups (the rule then requires naming both). This is a lookup over a hierarchy, which fits.

**Do not use it for:** personas, opportunities, "which direction is best", causes, forecasts or any statement about customers. These need evidence and review, not inference. Also never read a certificate as a business check: a certificate shows an inference matches the loaded data, not that the rule was translated correctly.

---

## 3. Maintenance

### 3.1 Layout

From ONTO-1 (PR #173). Items marked (new) are for the use cases above.

```text
ontology/
  README.md               how to rerun; tool version; base SHA; projection boundaries
  run-checks.sh           sets the environment and runs checks.py
  checks.py               runs every row of tests/manifest.json
  shapes/<RULE>.ttl       one shape file per rule ID
  tests/manifest.json     expected verdict for every dataset
  tests/valid/            datasets that must pass
  tests/invalid/          datasets that must be rejected (one broken condition each)
  tests/independent/      (new) cases written by a different model from the shapes
  results/<date>-<sha>.md and .json    commands, hashes, expected and actual
  review/<RULE>.md        blind back-translation and comparison with the rule
  data/                   (new) generated graphs for UC-1, UC-2, UC-4; never hand-edited
  queries/                (new) SPARQL for the use cases
```

### 3.2 Status of a shape

| Status | Meaning | Who moves it |
|---|---|---|
| `proposed` | Written, passes its own tests | the author |
| `reviewed` | A different model back-translated it without seeing the rule, a person or model compared that text with the rule, and independent cases pass | the reviewer records it in `review/<RULE>.md` |
| `adopted` | The owner decided to rely on it for a stated purpose | the owner, recorded as a row in `docs/research/ultimate-method/CHANGELOG.md` |
| `retired` | The rule changed or was removed | the author, with a CHANGELOG row |

Always write the reviewer honestly, for example "reviewed by model, not by a domain expert". Nothing is `adopted` yet.

### 3.3 Adding a rule

1. The rule comes from the Ultimate file or from a written owner decision. Never from the code alone. Record the exact place (file and line anchor at a commit SHA).
2. One shape file `shapes/<RULE>.ttl` with `ex:ruleId`, `ex:source`, `ex:status "proposed"` and a Vietnamese message that names the broken condition.
3. Datasets: one valid control and, for **each** condition, one invalid dataset that breaks only that condition (from its valid control).
4. A **different** model, given only the rule text and the vocabulary (not the shape), writes extra valid and invalid cases into `tests/independent/` with provenance.
5. A separate review agent using a model different from the shape author reads only a masked copy (remove rule ID, source links and ID-bearing names), then describes in Vietnamese what it enforces; compare with the rule and record differences in `review/<RULE>.md`.
6. Add rows to `tests/manifest.json` and run (3.5). For each negative row add `path` (property name) or `sourceShape` (reported IRI) when its filename is not already handled by the runner. Require the intended violation, not just any rejection. Keep independent expected results unchanged. A shape counts as fully checked only when every invalid dataset is rejected; record unsupported cases as ESCALATED, never passes.
7. If a part of the rule cannot be expressed, write it down in `review/<RULE>.md` as ESCALATED. Do not force it.
8. Follow the assigned path/branch scope. ONTO-2 permits `ontology/`, this runbook and `docs/handoffs/ONTO-2.md`; push only the task branch and open a draft PR. Do not merge or deploy.

### 3.4 When a rule in the Ultimate file changes

1. Start from the actual written rule change and its source revision. Use its CHANGELOG row when present; do not assume a commit-name convention or invent a business decision. For a throwaway rehearsal, record the hypothetical change in the exercise receipt without editing Ultimate or CHANGELOG.
2. Find the shapes: search `ex:ruleId "<ID>"` in `ontology/shapes/`.
3. Update the shape and datasets, keep status `proposed`, and pin a real source change to its new commit. For a rehearsal, change only the throwaway constraint; keep the real source untouched. A retired shape must be explicitly removed from the active manifest or it will still run.
4. Re-run the independent cases and the blind review (3.3, steps 4 and 5).
5. Add a note in the CHANGELOG row's "TDN" column or in the PR that the ontology was updated.
6. If the rule was removed, mark the shape `retired`; do not silently delete it.

The pinned source link can go stale. A later check (UC-1) should compare the pinned text with the current text and list rules whose text changed since.

### 3.5 Running and recording

Run from the repository root: `./ontology/run-checks.sh`. The runner exports `OPENWIKI_TELEMETRY_DISABLED=1`; use that setting for every manual OpenWiki-related command too. Rehearsal: `OPENWIKI_TELEMETRY_DISABLED=1 python3 ontology/guide-checks.py`. It needs `open-ontologies`, `oo-shacl`, Python 3 and Bash installed. These facts come from ONTO-1:

- Set `OPEN_ONTOLOGIES_STORAGE_MODE=persistent` and pass `--data-dir <scratch>` on every command that must see an earlier load. Without both, `load` and the next command do not share state.
- Pass `--no-connect`, so no daemon or network is used.
- `--version` is not supported. Record the installed release (2.0.1), the executable SHA-256 and the checker versions instead.
- Validation uses `shacl --verified <shapes>`, and the checker is selected with `OO_SHACL=<path of oo-shacl>`. The default SHACL evaluator skipped `sh:node` and returned `conforms:null`.
- `OPENWIKI_TELEMETRY_DISABLED=1 OPEN_ONTOLOGIES_STORAGE_MODE=persistent open-ontologies --no-connect --data-dir <scratch> validate <file.ttl>` checks syntax only. All manual load/check commands need the same environment, `--no-connect`, explicit data directory, and `OO_SHACL` for verified checks.
- The checker ignores `sh:message`. The runner matches the reported shape, path and constraint instead.
- The command exits with 0 even on some errors, so the runner also fails on errors, undetermined or skipped verdicts, and unexpected accept or reject. Do not rely on the exit code alone.
- The task runner stores `ontology/results/2026-10-08-<HEAD-prefix>.md` (commands, expected and actual per dataset) and `.json` (tool output, inputs, shape hashes). It uses the actual HEAD at execution, not origin/main. ONTO-1 hard-coded a historical SHA; its unchanged baseline is preserved separately. For later dates update the run date before recording a new task. A receipt commit can follow the tested implementation commit; compare hashes, not an impossible self-referential commit hash.

### 3.6 Reading results

- "Rejected" means the data violates the shape. Also check the reason: E4 now reports `OrConstraintComponent` on named `E4AuthorIDs` or `E4UnverifiedContent` shapes, so the mode is identifiable. Do not match `sh:message`: the checker ignores it. Match sourceShape/path/constraint. UNDETERMINED is not a pass; the escaped-control-whitespace limitation remains explicitly ESCALATED.
- Duplicate literals in RDF collapse into one. A test with the same value twice is the same test as with one value.
- A passing smoke test (load, reason with RDFS, query) proves the tool works. It is not a business check.
- Certificates (`reason --certificate`, `oo-cert`) show an inference matches the asserted triples, nothing more.

### 3.7 Review

- The owner has said they cannot review technical thresholds. Use a model different from the shape author for independent cases and cold review; keep case authoring and blind review in separate agents with restricted inputs, and record model/date/provenance. ONTO-2 uses Codex for shapes and separate GPT-6-astra agents for those two reviews.
- A person with domain knowledge may review later; record the date and name only if they agree to be named.

### 3.8 Rules that never change

- All test data is synthetic. No real comments, reviews, figures or personal data.
- No secrets, tokens, machine paths or IPs in any file.
- The MCP server of the tool is not registered with any agent. No agent configuration changes.
- Not connected to the app, the report pipeline or CI until the owner decides so, using `adopted` shapes only.
- Paid or live data collection is never part of an ontology run.

### 3.9 ONTO-2 corrections and remaining limits

The six ONTO-1 gaps were addressed with separate exact-source E12/E13 shapes,
required E13 metadata, whitespace range constraints, persona-scoped author/card
links, deletion of the duplicate-author case, named E4 identity-mode verdicts and
fresh independent cases/cold reviews. All shapes stay proposed.

ESCALATED: escaped tabs/newlines/CR in data cause the verified checker to decline
judgment. Their expected REJECT stays frozen. Invisible formatting characters are
not all whitespace. Authenticity, individual card-to-author provenance, E4 group
size/demographic claims, PDF traces and wider E12/E13 semantic obligations remain
outside the bounded metadata projection; see the per-rule reviews.

Corrections found by the 3.3–3.5 rehearsal:

1. Record exercised guide sections separately from proposed use cases.
2. Mask IDs/sources and restrict cold-review inputs; distinguish reviewer agents.
3. Add intended path/sourceShape selectors for new negative rows.
4. Honor actual task path scope and draft-only PR authorization.
5. Trigger changes from written evidence rather than assumed commit naming.
6. Keep simulations out of real Ultimate/CHANGELOG and remove retired rules from active manifests.
7. Include telemetry-off, persistent state, no-connect and data-dir in manual commands.
8. Record actual HEAD and task date; preserve the old runner's baseline naming caveat.
9. Match E4 named mode shapes, never ignored messages; distinguish escalation from pass.
10. Document checker regex subset and unsupported escaped data, not just minLength.


## 4. Suggested order

1. ONTO-1 is in the assigned main baseline. Review ONTO-2 evidence and remaining escalations; shapes stay `proposed`. Merge remains the owner’s action.
2. Build UC-1 (script, graph, queries, shapes) as ONTO-3. Success looks like a list of real mismatches in the existing documents, each confirmed by reading the documents.
3. Do UC-2 together with package P6-08, using a synthetic ledger first.
4. UC-4 after UC-1 works, by reusing its graph.
5. UC-5 and UC-6 only when the conditions above are met.
