# Wiki and ontology setup: OpenWiki and Open Ontologies on Fedora

Updated: 2026-10-08 · Tools: [OpenWiki](https://github.com/langchain-ai/openwiki), [Open Ontologies](https://github.com/fabio-rovai/open-ontologies), [CodeGraph](https://github.com/colbymchenry/codegraph) (already installed for the Orca agents)

## Tóm tắt (cho chủ shop)

Có ba công cụ, mỗi công cụ một việc:

| Công cụ | Việc | Tốn tiền model |
|---|---|---|
| CodeGraph (đã có) | Tìm code, xem ai gọi hàm nào, sửa thì ảnh hưởng gì | Không |
| OpenWiki | Wiki bằng chữ về kiến trúc, luồng nghiên cứu, 30 section, nguồn dữ liệu và các quyết định đã chốt | Có, khi tạo và cập nhật wiki |
| Open Ontologies | Chuyển một số business rule thành luật kiểm (SHACL) và chạy thử với dữ liệu đúng và sai | Không |

Làm hai việc, độc lập nhau, mỗi việc một agent trong Orca, một nhánh, một PR nháp:
1. **Wiki (W):** tạo `openwiki/` từ bản code mới nhất của `main`, theo bản hướng dẫn đã có sẵn ở `openwiki/INSTRUCTIONS.md` (wiki chỉ giải thích bối cảnh, không chép lại business rule, không mô tả từng hàm).
2. **Ontology (O):** thử trên một nhóm nhỏ rule lấy từ file Ultimate. Mỗi rule có dữ liệu đúng và dữ liệu cố tình sai. Giữ trạng thái "đề xuất" tới khi review.

Cả hai chỉ hỗ trợ agent và kiểm tra. **Chưa nối vào luồng chạy báo cáo, chưa đổi bản chạy thật.** Mọi merge vẫn do chủ shop.

---

## 1. Ground rules

- Source of truth for business rules is `docs/research/ultimate-method/ultimate-method-30-sections.md`. The wiki and the ontology are derived from it; they never override it. A conflict is reported, not resolved by the tool.
- Do **not** run `openwiki integrations install` and do not change any Orca, ZCode, oh-my-pi, opencode or Codex configuration (owner standing rule). Use `openwiki --init` / `openwiki --update` directly.
- Do **not** register the Open Ontologies MCP server (`open-ontologies serve`) with any agent. Use the CLI only.
- No secrets in the repo, in logs or in the handoff. Never print or read key files (`~/.openwiki/.env`, `~/.config/tdn-growth-os`). If a command fails for a missing key, stop and report ESCALATED; do not ask for the key in the chat.
- OpenWiki sends repository content to the model provider the owner configured. Use the provider already configured on the machine; do not change it.
- Work only in the assigned Orca worktree. Branch from the latest `origin/main`. Do not merge or deploy.
- Neither tool is wired into the application. `package.json` and the lockfile do not change.

## 2. Checklist

### W. OpenWiki

- [ ] W-01 Fresh worktree from the latest `origin/main`; record the SHA in the handoff. (The old checkout was 163 commits behind.)
- [ ] W-02 Record `openwiki --version`, Node version, the provider and model id in use (not the key).
- [ ] W-03 Run `openwiki --init` with `OPENWIKI_TELEMETRY_DISABLED=1`. `openwiki/INSTRUCTIONS.md` and `.openwikiignore` already exist in the repo; do not rewrite them.
- [ ] W-04 Review the diff of `AGENTS.md` and `CLAUDE.md`. Only the block between `<!-- OPENWIKI:START -->` and `<!-- OPENWIKI:END -->` may change. Make sure it does not contradict the existing CodeGraph instructions (for example two different "read this first" orders). If it does, edit only inside the OpenWiki block, or report it.
- [ ] W-05 Check these pages against the code and the docs, and fix or flag each error: architecture, research flow, the two Market report lanes, the 30 sections, data sources, work packages, decisions. Per page, record in the handoff: the files read, and what was wrong.
- [ ] W-06 Content rules from `openwiki/INSTRUCTIONS.md` hold: no per-function pages, business rules only by ID and link, every claim about code has a path, status words are merged / open PR / planned with the checked SHA, no secrets or machine paths.
- [ ] W-07 Section status pages agree with the "Current state" table in `docs/tasks/ultimate-v1.11-tdn-sync-plan.md` (code that still differs from a rule must be stated as differing).
- [ ] W-08 Do not add the CI workflow for daily updates. Describe in the handoff how it would be added, for the owner to decide.
- [ ] W-09 `git diff --check` is clean; no file outside `openwiki/`, `AGENTS.md`, `CLAUDE.md`, `.openwikiignore`, `docs/handoffs/` changes.
- [ ] W-10 Handoff `docs/handoffs/WIKI-1.md` from `templates/handoff.md` with a "Checklist evidence" table, then push and open a **draft PR**.

**Done when:** `openwiki/` exists, the 10 key pages were checked against code with the findings listed, and the PR changes only the files in W-09.

### O. Open Ontologies

Group 1 rules (all from the Ultimate file, with the section link on each shape):

| Rule | Source | Shape checks |
|---|---|---|
| E4 persona minimums | E4 | a persona has ≥3 evidence cards, ≥5 distinct authors (or the "chưa xác minh là 5 người" flag), every attribute has a quote with a locator, the AI label is present |
| L10 customer voice | L10, L2 | a comment by the video creator or a brand account is not typed as customer voice; a tag-only or emoji-only comment is not counted; the source type is present |
| E12 / E13 official figures | E12, E13 | attribution text present, value status is one of ước tính / sơ bộ / chính thức, file / sheet / row trace present |
| UNKNOWN is not WIDE | the classification rule in the existing docs or in `reader-report/classify.ts` | only if an authoritative written source is found; otherwise skip it and say so |

- [ ] O-01 Fresh worktree from the latest `origin/main`; record the SHA.
- [ ] O-02 Run `open-ontologies --help` and `--version`; record the actual command names. In particular confirm the SHACL command before using it; the project README documents only `validate <file.ttl>`. Record the result of the confirmation, whichever it is.
- [ ] O-03 Set `OPEN_ONTOLOGIES_STORAGE_MODE=persistent` and pass `--data-dir` explicitly for every command that must share state. Without both, `load` followed by `reason` in another invocation can certify nothing.
- [ ] O-04 Create `ontology/` with: `README.md` (how to rerun everything, tool versions, the SHA), `shapes/<RULE_ID>.ttl`, `tests/valid/<RULE_ID>-*.ttl`, `tests/invalid/<RULE_ID>-*.ttl`, `run-checks.sh` (fixed argv, no network, exits non-zero on any unexpected result), and `results/`.
- [ ] O-05 Every shape carries: the rule ID, a link to the exact place in the Ultimate file, `status "proposed"`, and a plain Vietnamese message that names the broken condition.
- [ ] O-06 For each rule: one valid dataset and at least one invalid dataset **per sub-condition** (for example E4: 2 cards, 4 authors, a missing quote, a missing label). All invalid datasets are synthetic. Valid data must pass; every invalid dataset must be rejected for the stated reason.
- [ ] O-07 Run the checks and store in `ontology/results/<date>-<SHA>.md`: the commands, tool version, input file hashes, output, pass or fail per dataset. A shape counts as checked only when its invalid datasets are rejected.
- [ ] O-08 Reasoning smoke (`load` → `reason --profile rdfs` → query) is recorded separately, and its result is not described as a business-rule check.
- [ ] O-09 Certificates: try `reason --certificate` and the Lean checker only if they are installed; report whether they ran. Do not claim a certificate verified a business rule: it proves the inference matches the loaded data, not that the translation is right.
- [ ] O-10 Independent review: a **different model** reads each shape cold and writes in Vietnamese what rule it enforces, without seeing the rule ID or the Ultimate text. A third step compares that sentence with the Ultimate sentence and records any difference in `ontology/review/<RULE_ID>.md`. Status stays `proposed`; record "reviewed by model, not by a domain expert".
- [ ] O-11 Nothing outside `ontology/`, `docs/handoffs/` changes. No MCP registration, no agent config change, no `package.json` change.
- [ ] O-12 Handoff `docs/handoffs/ONTO-1.md` with the "Checklist evidence" table, then push and open a **draft PR**.

**Done when:** each shape passes its valid data and rejects every invalid dataset for the right reason, the results file lets another agent rerun it, and the review notes list any rule the tool could not express.

## 3. Prompts

### 3.1 Orchestrator prompt (for the ZCode agent, which dispatches through the Orca CLI skill)

```text
You coordinate two independent tasks for the repository khangpworking/tdn-growth-os through Orca. Use your Orca CLI skill. Do not invent Orca commands: if you cannot find how to create a worktree or start an agent, stop and report.

First: git fetch origin. The runbook docs/runbooks/wiki-and-ontology.md is on origin/main once its PR is merged; until then read it from origin/claude/new-session-6ff92m. Read it fully, plus AGENTS.md.

Then create two worktrees from the latest origin/main and start one worker agent in each:
1. Worktree "wiki", branch pkg/WIKI-1-openwiki. Worker prompt: section 3.2 of the runbook, verbatim.
2. Worktree "ontology", branch pkg/ONTO-1-open-ontologies. Worker prompt: section 3.3 of the runbook, verbatim.
They touch different files and may run in parallel.

Rules for you:
- Do not edit files yourself, merge, deploy, push to any other branch, or change any Orca, ZCode, oh-my-pi, opencode or Codex configuration.
- Never print or read key files or environment secrets. If a worker reports a missing key, relay "ESCALATED: missing provider key" and stop that worker.
- Workers push their own branch and open a draft PR only. If a worker has no push access, collect its commits and report the branch name.
- When both finish, report in Vietnamese: for each task the PR link, the origin/main SHA used, the checklist rows by ID with DONE / ESCALATED / N/A, and anything that failed. Quote the key results (which shapes rejected which bad data; which wiki pages were wrong), not just "done".
```

### 3.2 Worker prompt W (OpenWiki)

```text
You are working in the repository khangpworking/tdn-growth-os, in your assigned Orca worktree.

Task: implement checklist W-01 … W-10 of docs/runbooks/wiki-and-ontology.md (section 2, "W. OpenWiki"). Branch pkg/WIKI-1-openwiki from the latest origin/main.

Read first: AGENTS.md, docs/runbooks/wiki-and-ontology.md (all of section 1), openwiki/INSTRUCTIONS.md, and .openwikiignore.

Rules:
- Run openwiki directly (openwiki --init). Do NOT run "openwiki integrations install". Do not change any agent configuration (Orca, ZCode, oh-my-pi, opencode, Codex).
- Set OPENWIKI_TELEMETRY_DISABLED=1. Use the provider already configured on this machine. Never read or print ~/.openwiki/.env or any key. If the run fails because no key or provider is configured, stop and report "ESCALATED: missing provider key".
- You may also use `codegraph explore` to check claims about code.
- Do not rewrite openwiki/INSTRUCTIONS.md or .openwikiignore. If you think they need a change, say so in the handoff.
- The business source of truth is docs/research/ultimate-method/ultimate-method-30-sections.md. Wiki pages must not restate rules; they state the rule ID, link, and where the code stands.
- No secrets, machine paths, IPs or real commercial data in any file. Do not merge or deploy.

Finish with: commits named "WIKI-1: <summary>"; docs/handoffs/WIKI-1.md (templates/handoff.md plus a "Checklist evidence" table with one row per W-xx item, each DONE with evidence, ESCALATED with the reason, or N/A with the reason); the list of the 10 key pages you checked and what was wrong in each; a clean git status; then push the branch and open a draft PR.
```

### 3.3 Worker prompt O (Open Ontologies)

```text
You are working in the repository khangpworking/tdn-growth-os, in your assigned Orca worktree.

Task: implement checklist O-01 … O-12 of docs/runbooks/wiki-and-ontology.md (section 2, "O. Open Ontologies"). Branch pkg/ONTO-1-open-ontologies from the latest origin/main.

Read first: AGENTS.md, docs/runbooks/wiki-and-ontology.md (section 1 and the O checklist), and docs/research/ultimate-method/ultimate-method-30-sections.md (rules E4, E12, E13, L2, L10 and rules 1–9). The Ultimate file is the source of truth; never change it.

Rules:
- Use the open-ontologies CLI only. Do NOT register its MCP server with any agent, and do not change any agent configuration.
- Run `open-ontologies --help` first and use the real command names. The project README documents only `validate <file.ttl>` for validation; confirm how SHACL is run before relying on it, and record what you found.
- Always set OPEN_ONTOLOGIES_STORAGE_MODE=persistent and pass --data-dir explicitly when a later command must see an earlier load.
- All test data is synthetic; no real posts, comments, reviews or figures.
- A shape counts as checked only when its invalid datasets are rejected for the stated reason. A reasoning smoke test (load, reason, query) is not a business-rule check, and a certificate does not prove the rule was translated correctly. Say exactly which you ran.
- If a rule cannot be expressed as SHACL, do not force it: write the reason in ontology/review/<RULE_ID>.md and mark it ESCALATED.
- Nothing outside ontology/ and docs/handoffs/ may change. No package.json change, no network access other than what the tool itself needs.
- No secrets, machine paths, IPs. Do not merge or deploy.

Finish with: commits named "ONTO-1: <summary>"; docs/handoffs/ONTO-1.md (templates/handoff.md plus a "Checklist evidence" table with one row per O-xx item, each DONE with evidence, ESCALATED with the reason, or N/A with the reason); a table of every dataset with the expected and actual result; a clean git status; then push the branch and open a draft PR.
```

## 4. After both PRs are open

- Owner reads the two handoffs and the wiki page-check list, then merges or sends changes back.
- Only after the owner has seen the first ontology results should anyone discuss using shapes in the report pipeline or adding daily wiki updates.
- Record the main SHA and tool versions in the PR descriptions so a later run can be compared.
