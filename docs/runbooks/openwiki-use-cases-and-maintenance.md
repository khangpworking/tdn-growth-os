# OpenWiki: use cases and maintenance

Updated: 2026-10-08 · Tool: [OpenWiki](https://github.com/langchain-ai/openwiki) (LangChain; npm package `openwiki`) · Setup and first run: [wiki-and-ontology.md](wiki-and-ontology.md) · Brief the tool reads: [`openwiki/INSTRUCTIONS.md`](../../openwiki/INSTRUCTIONS.md)

Status: **generated and under review in the WIKI-2 draft**. OpenWiki 0.7.1 initialization and bounded correction runs were observed on checked main `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`. See [WIKI-2 evidence and limitations](../handoffs/WIKI-2.md) for page findings, Q&A, elapsed time, and the unchanged-update check. This is not deployment or business acceptance.

## Tóm tắt (cho chủ shop)

OpenWiki viết một **bộ wiki bằng chữ** về dự án, lưu trong thư mục `openwiki/`, để agent (và anh) hiểu bối cảnh nhanh: hệ thống gồm gì, báo cáo chạy theo luồng nào, đã làm đến đâu, quyết định nào đã chốt. Nó không thay CodeGraph (tìm hàm, xem ai gọi ai) và không thay file Ultimate (nguồn chuẩn của business rule).

| # | Use case | Ai hưởng lợi | Nên làm |
|---|---|---|---|
| W1 | Agent hiểu bối cảnh trước khi sửa code | Agent trong Orca | Làm đầu tiên |
| W2 | Bản đồ "đã làm đến đâu" (merged / PR mở / dự kiến) | Chủ shop, agent | Làm đầu tiên |
| W3 | Chỉ mục rule → chỗ code đang đứng thế nào | Agent, người review | Làm sau lần tạo đầu |
| W4 | Bản đồ nguồn dữ liệu → bộ thu → gói việc | Chủ shop, agent | Làm sau lần tạo đầu |
| W5 | Hỏi đáp bằng tiếng Việt về hệ thống | Chủ shop | Làm khi wiki đã được kiểm |
| W6 | Phát hiện tài liệu lệch so với code sau mỗi lần merge | Người review | Thử, chưa tin hoàn toàn |

Cách bảo trì ngắn gọn: cập nhật bằng `openwiki --update` sau các đợt merge lớn, mở PR riêng chỉ chứa thay đổi của wiki, kiểm vài trang với code, **không tự động hoá và không auto-merge** cho tới khi lần đầu đã được kiểm và anh quyết định.

---

## 1. What it is, and what it is not

- A folder of markdown pages (`openwiki/`) written by a model from the repository, with **claims**: each statement is tied to versioned evidence such as `repo://src/server.ts#L40-L82`, stored in `openwiki/.claims/`.
- Updates are incremental. Before an update OpenWiki rechecks the evidence behind every claim; a stale claim forces work on its page, a clean repo skips model work.
- It also keeps an `AGENTS.md` block (and `CLAUDE.md` if present). In 0.7.1 the generated block describes optional just-in-time retrieval; preserve the repository startup order and CodeGraph division of work.
- **Not** a source of truth. Business rules stay in `docs/research/ultimate-method/ultimate-method-30-sections.md`; the wiki cites the rule ID and says where the code stands.
- **Not** code navigation. Finding a function, its callers or blast radius is CodeGraph (`codegraph explore`). `openwiki/INSTRUCTIONS.md` already tells the wiki not to write per-function pages.
- **Not** private: wiki generation sends repository content to the model provider the owner configured.

## 2. Use cases

### W1 Context for coding agents

- **Goal.** A worker in Orca reads the wiki for background (architecture, boundaries, where a section is built, what the owner decided) before touching code.
- **How.** The `AGENTS.md` block written by OpenWiki points agents to `openwiki/`. Agents search it with the tools OpenWiki provides to the agent host; the README names `openwiki_search` and `openwiki_read` for that. In this project the Orca workers use Codex and other agents; whether those tools are available to them depends on the integration, which we do not install (see the ground rules in the setup runbook). Without them, an agent reads `openwiki/index.md` and the page files directly.
- **Division of work.** Wiki: "how does the research flow fit together; who owns report versions". CodeGraph: "where is this function; what breaks if I change it".
- **Check it works.** Give an agent three background questions whose answers you know (for example "which report lane does the owner read, and which one is the governed draft?") and compare. Wrong or missing answers are bugs in `INSTRUCTIONS.md` or in the pages.

### W2 "How far along is it" map

- **Goal.** One place that says, per area and per section M01–M13 and I01–I17, whether the behaviour is merged on main, in an open PR, or only planned.
- **Why the wiki.** The status changes with every merge, and hand-written status documents drift. OpenWiki can recheck evidence and rewrite stale pages.
- **Rules.** Every status line carries the main SHA it was checked against. No page may say a rule is "implemented" without a path; where code differs from a rule it must say "code differs from rule <ID>" (this is already in the brief).
- **Overlap to watch.** `docs/tasks/ultimate-v1.11-tdn-sync-plan.md` is a hand-written plan with the audit table. The wiki page links to it and does not copy the table.

### W3 Rule-to-code index

- **Goal.** For each business rule ID (E1…E14, L1…L10, rules 1–9), one line: link to the rule, files that implement or violate it, status.
- **Rule for the wiki.** It never restates the rule in its own words; the Ultimate file does that. This keeps one source of truth.
- **Use.** Reviewers and workers see at a glance which rules a change touches. Works with the ontology use case UC-4 ([ontology guide](ontology-use-cases-and-maintenance.md)): the ontology answers "what is affected" from tables; the wiki explains it in words.

### W4 Data source map

- **Goal.** A page mirroring the source registry: source IDs S01…, tier, whether a collector exists, which package builds it, which section uses it.
- **Source of the page.** The registry file `docs/research/ultimate-method/input-data-sources-30-sections.md`. Provider names are allowed in the wiki (it is internal); the report-text rule against naming providers is noted where relevant.
- **Risk.** Two copies of the same table drift. If the page and the registry disagree, the registry wins and the page is regenerated; do not hand-edit the page.

### W5 Owner Q&A

- **Goal.** The owner asks an agent in Vietnamese ("bước nào đang chạy tay?", "nguồn nào đã có bộ thu?") and the answer comes from the wiki, with page references.
- **Also.** `openwiki visualize` opens a local browsable view (loopback-only, port 4321 by default; it loads its libraries from a public CDN, so it needs internet).
- **Condition.** Only after the W1 check passes, otherwise the owner gets confident wrong answers.

### W6 Drift detector

- **Idea.** After a merge, `openwiki --update` rewrites only pages whose evidence changed. The pages that changed show which documented behaviour the merge touched. A merge that changes behaviour but touches no wiki page is worth a second look.
- **Caveat.** The model decides what is stale and what to rewrite; treat the output as a hint to read the diff, not as proof.

### Not recommended

- Using the wiki to decide business rules or settle a conflict between code and the Ultimate file.
- Per-function or per-file pages (CodeGraph does this).
- Personal-brain mode and connectors (Gmail, Notion, social). Out of scope; the coding-agent integration does not support them either.
- LangSmith tracing. It is an extra service that receives traces; leave it off unless the owner decides otherwise.

## 3. Maintenance

### 3.1 What is in the repo

```text
openwiki/INSTRUCTIONS.md      owner brief; OpenWiki reads it and never rewrites it
openwiki/index.md, log.md     reserved pages
openwiki/<pages>.md           generated pages
openwiki/.claims/             claim sidecars tied to source evidence
openwiki/.page-manifest.json  per-page source baselines
openwiki/.last-update.json    records that an update check ran
openwiki/.run.json            checkpoint of a run in progress; deleted at the end
.openwikiignore               read boundary (see 3.5)
AGENTS.md / CLAUDE.md         only the block between <!-- OPENWIKI:START --> and <!-- OPENWIKI:END -->
private OpenWiki config      provider settings and keys; outside the repo
```

`openwiki --init` replaces the generated pages and claims but keeps `INSTRUCTIONS.md`.

### 3.2 When to update

- After a **wave of merges** that changes architecture, a section's behaviour, the source registry or the package status. Not after every PR.
- After the Ultimate file changes a rule: pages cite rule IDs only, so usually nothing to do; run an update only if code status changed too.
- Use `--init` again only when the brief changed a lot or the wiki structure is wrong. It costs a full model run.

### 3.3 How to update

1. New worktree from the latest `origin/main`; record the SHA.
2. Use the existing private config directory only when authorized by the owner; do not inspect its environment file or require a shell-key preflight. For every invocation set `OPENWIKI_CONFIG_DIR` to that authorized directory, `OPENWIKI_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`, and `LANGCHAIN_TRACING_V2=false`. Optionally set `OPENWIKI_PAGE_CONCURRENCY=2`. Do not change provider/model settings.
3. Run `openwiki --update` (or the equivalent `openwiki code --update --print` used in the example workflow).
4. The CLI also rewrites its managed instruction blocks on each invocation; review and repair them within the markers after the final invocation, especially the false scheduled-workflow claim and any authority contradiction. After the process exits, remove any leftover `openwiki/.run.json`. Inspect the changed paths: 0.7.1 initialization can create `.github/workflows/openwiki-update.yml`; remove that unrequested file. Do not retain or enable a CI workflow.
5. Review the diff (3.4). Push only the assigned work branch and open a draft PR containing `openwiki/`, only the OpenWiki blocks of `AGENTS.md`/`CLAUDE.md`, and a handoff note. Correct this maintenance guide only when the task authorizes evidence-based guide changes; record each correction.
6. The owner merges. No auto-merge.

### 3.4 Review checklist for a wiki PR

- Only the files listed in step 5 changed. In `AGENTS.md`/`CLAUDE.md` only the OpenWiki block changed.
- The block does not contradict the CodeGraph instructions in the same file (for example two different "read this first" orders).
- For initial WIKI-2 acceptance, check ten pages against code and docs, including both Market lanes; for later maintenance spot-check at least five pages, including every page that changed for a reason you cannot see in the merged PRs. Each claim about code has a path; each status word is "merged", "open PR" or "planned", with the checked SHA.
- No page restates a business rule's text. Rules appear as ID plus link.
- Where code and the Ultimate file disagree, the page says so.
- No secrets, tokens, machine paths, IPs or real commercial data. The brief already forbids them; check the diff anyway.
- Each Mermaid diagram renders. OpenWiki validates diagrams after each run and turns failed ones into plain text blocks that are repaired on the next update.
- Record in the PR: OpenWiki version, provider and model id (not the key), the SHA, and the cost if the provider dashboard shows it.

### 3.5 Changing the brief and the ignore file

- `openwiki/INSTRUCTIONS.md` is where scope, priorities and known corrections live. A page that is wrong because the code or documents are ambiguous is fixed at the source (the code, the registry, the Ultimate file). A page that is wrong for any other reason gets a short correction note in the brief, for example under "Known corrections", because hand edits to generated pages are overwritten at the next update.
- `.openwikiignore` supports comments, `*` and `**` globs, directory rules and `!` negation. It is a read boundary, not a guarantee: a topic can still be inferred from allowed evidence such as tests or the README. Do not rely on it to hide secrets.
- After editing either file, run an update and check the pages that depend on it.

### 3.6 Scheduled updates (CI): not yet

The example workflow in the OpenWiki repo (`examples/openwiki-update.yml`) runs on a daily cron and on manual dispatch, installs `openwiki`, runs `openwiki code --update --print`, and opens a PR on a branch `openwiki/update` using `peter-evans/create-pull-request`. Notes from that example if the owner later wants it:
- It does **not** pin the `openwiki` version (only two helper packages are pinned). Pin it, as the README itself advises.
- It uses a provider key and a LangSmith key as repository secrets. We would not enable LangSmith.
- Telemetry is on unless `OPENWIKI_TELEMETRY_DISABLED` is set; set it.
- It stages `AGENTS.md` and the workflow file with the wiki. Keep the PR reviewed and never use the auto-merge variant: every merge is the owner's.

Conditions before adding it: the first wiki was reviewed with the checklist above, the cost of one update is known, and the owner chose the provider and where its key is stored.

### 3.7 Cost and rate limits

- Check clean-update behavior empirically: commit the generated wiki first, run `--update`, then record its diff and elapsed time. Expected content is unchanged except `.last-update.json`; this is an acceptance check, not a guarantee. Report cost as not visible unless actual usage/cost is shown.
- A stale claim forces a page to be reworked even if the planner would skip it, so large refactors cost more.
- Parallel workers: `OPENWIKI_PAGE_CONCURRENCY` from 1 to 8; the provider's rate limits can lower concurrency during a run and the page is picked up next time.
- Record the cost of the first `--init` and each update in the PR. If it is too high, narrow `INSTRUCTIONS.md` and `.openwikiignore` before reducing quality.

### 3.8 Troubleshooting

| Symptom | Cause and action |
|---|---|
| `OPENAI_API_KEY is required for non-interactive runs` | Seen in the first Orca worker run. The default provider is OpenAI and non-interactive runs read the key from the environment. Use only the existing owner-authorized private configuration. Do not read the environment file, export or inspect keys, or change provider/model settings. If the authorized invocation still reports a missing key, stop and report ESCALATED. |
| `openwiki --version` fails | Observed with 0.7.1. Use `npm ls -g openwiki --depth=0` and `node --version`. Non-TTY `--help` printed version/provider/model but then raised an Ink raw-mode error; do not treat help exit status alone as success, and do not use credential-debug diagnostics. |
| Leftover `openwiki/.run.json` | An interrupted run. Delete it and run `--update`. |
| Wiki contradicts `AGENTS.md` instructions | Edit only inside the OpenWiki block, or add a correction to the brief and rerun. |
| Visualizer shows nothing | It loads its libraries from a public CDN; check internet access. |
| A page keeps coming back wrong | Do not hand-edit it. Fix the source or add a correction note to the brief. |

### 3.9 Rules that do not change

- No `openwiki integrations install`, and no change to any Orca, ZCode, oh-my-pi, opencode or Codex configuration, unless the owner asks.
- No secrets in the repo, logs or wiki pages. Never print or read the private OpenWiki environment file.
- The wiki is derivative: the Ultimate file, `AGENTS.md` (outside the OpenWiki block), `ARCHITECTURE.md`, the registry and the CHANGELOG stay the sources.
- The wiki is not wired into the application or the report pipeline.
- Every merge is the owner's. Telemetry stays off.

### 3.10 Retiring the wiki

If it is not used, remove `openwiki/`, `.openwikiignore` and the OpenWiki block from `AGENTS.md`/`CLAUDE.md` in one PR, and say so in the CHANGELOG-style note of the PR.

## 4. Suggested order

1. Use the merged setup runbook and the existing owner-authorized private configuration; do not give keys to the worker.
2. Run the first `--init` (checklist W-01…W-10 in the setup runbook) and review it with section 3.4.
3. Run the W1 check with three questions the owner knows the answer to.
4. Use W2 and W4 for a month, then decide on W5 and on scheduled updates (3.6).
