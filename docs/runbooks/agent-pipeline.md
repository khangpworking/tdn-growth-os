# Agent pipeline: from package checklist to a reviewed draft PR

Updated: 2026-10-07 · Work list: `docs/tasks/research-batch-2-packages.md`

## Tóm tắt (cho chủ shop)

Luồng này thay cho việc chuyền file và nhắn qua lại. Với mỗi gói việc:
1. Agent làm (oh-my-pi hoặc opencode).
2. Model khác review, so với checklist. Có lỗi thì agent sửa, tối đa 3 vòng.
3. Kiểm tra tự động: test, typecheck, file nào được sửa, có lộ khoá hay đường dẫn máy không.
4. Agent tự đẩy nhánh lên và mở **PR nháp**.
5. Claude review lần cuối trên GitHub. Nếu còn lỗi, agent sửa tiếp trên chính nhánh đó.
6. Đạt hết thì chủ shop nhận **một** thông báo "sẵn sàng merge". **Merge và deploy vẫn chỉ do chủ shop.**

Chủ shop chỉ cần xử lý khi được báo: sẵn sàng merge, hoặc bị chặn và cần quyết định.

---

## 1. Roles

| Role | Who | May do | Never does |
|---|---|---|---|
| Runner | a script on the Fedora operator host (built from this spec; kept private, not in this repo) | create worktrees, start workers and reviewers, run gates, push the package branch, open a draft PR, read PR comments, notify the owner | merge, deploy, edit code itself |
| Worker | oh-my-pi or opencode, worker model | edit owned paths, commit locally, write the handoff | push, PR, `gh`, network calls to providers |
| Advisor | the tool's advisor role, a stronger model | answer the worker's design questions inside the session | edit files |
| Reviewer | **Codex CLI on Fedora (via Orca), model Astra 6, reasoning effort high, read-only sandbox** (owner choice 2026-10-07; see §5) | read the diff, re-run the gates, write a verdict | edit files, push |
| Final reviewer | a Claude Code cloud session (scheduled routine or on request) | re-run the tests on Linux, verify the checklist, post a review, mark the PR ready | push to the package branch, merge |
| Owner | khangpworking | merge, deploy, approve paid or live actions | |

## 2. Package lifecycle

`QUEUED → WORKING → REVIEW(n) → GATES → PUSHED → DRAFT_PR → FINAL_REVIEW → READY_FOR_OWNER → MERGED`

- REVIEW gives CHANGES → back to WORKING, at most **3 internal rounds**.
- FINAL_REVIEW gives CHANGES → back to WORKING on the same branch, at most **2 external rounds**.
- Any of these → `BLOCKED`, and the owner is notified once:
  - a round limit is exceeded;
  - a gate fails twice in a row;
  - the worker reports ESCALATED on a checklist item;
  - an owner gate is needed.

A wave-1 package starts as soon as the runner is free. A gated package (P5–P8) stays `QUEUED` until its gate is recorded as met.

## 3. Worker prompt (the runner assembles it; nothing is pasted by hand)

1. The fixed rules:
   - `AGENTS.md`;
   - "Global definition of done" (G-01…G-12) from the work list;
   - no merge, no push, no PR, no `gh`, no provider calls, no secrets, owned paths only.
2. The package section from the work list, verbatim: owned paths, anchors, checklist, "Functional when".
3. The branch and base:
   - branch `pkg/<id>-<slug>` from the latest `origin/main`;
   - on later rounds, the same branch with `origin/main` merged in (a merge, never a rebase or force-push).
4. On later rounds: the reviewer's findings JSON, or the final reviewer's PR comment, quoted as data. Instruction: fix each finding or answer it in the handoff.
5. Finish with:
   - commit(s) `<ID>: <summary>`;
   - the handoff `docs/handoffs/<ID>.md` with the evidence table (§4);
   - a clean `git status`.

## 4. Handoff evidence table (required)

```markdown
## Checklist evidence
| ID | State | Evidence |
|---|---|---|
| P1-01 | DONE | `reports.ts:352` creates the registry; test `report citations: first appearance order` |
| P1-09 | ESCALATED | PDF is rendered by …; needs owner choice of web vs pdf format |
| G-02 | DONE | `npm test`: 1061 tests, 1058 pass, 3 fail (Task045 baseline) |
```

- Every package ID and every G-ID must appear in the table.
- A row without evidence counts as not done.

## 5. Review step (internal, every round)

- **Reviewer command (owner choice 2026-10-07):**

  ```bash
  codex exec --sandbox read-only -c model='"<Astra 6 model id as Codex lists it>"' -c model_reasoning_effort='"high"' \
    --cd <worktree> "<review prompt>" </dev/null
  ```

  - The reviewer is always a different model from the worker; Astra 6 is never the worker in the same round.
  - Running the gates needs `npm test` to write temp files. If the read-only sandbox blocks that, the runner runs the gates (§6) and passes their output to the reviewer.
  - If the ChatGPT/Codex quota is exhausted, the runner marks the package `BLOCKED: reviewer quota` and notifies the owner. It never falls back to the worker's own model. Another reviewer model needs an owner decision.
- **Input:**
  - `git diff origin/main...HEAD`;
  - the package section;
  - the handoff;
  - the gate output (§6).
- **Instructions to the reviewer:**
  - verify each checklist row against the diff and the tests, not against the handoff's claims;
  - look for: weakened tests, files outside owned paths, provider names in owner-facing text, defaults that turn missing into 0, retries, network calls, and secrets.
- **Output:** a file `review-<round>.json`:

  ```json
  { "verdict": "PASS | CHANGES | BLOCKED",
    "findings": [ { "checklistId": "P1-08", "file": "…", "line": 0, "severity": "blocking | minor", "problem": "…", "fix": "…" } ] }
  ```

- **Result:**
  - PASS → GATES;
  - CHANGES → a new worker round with these findings;
  - BLOCKED → notify the owner.

## 6. Gates (mechanical, the runner runs them; the reviewer also re-runs them)

1. `npm ci`, if `node_modules` is missing (lockfile only).
2. `npm run typecheck`.
3. `npm test`. The only allowed failures are the baseline in G-02. Any other failure fails the gate.
4. `npm run frontend:typecheck` and `npm run frontend:test` if `frontend/` changed.
5. `npm run contracts:generate && git diff --exit-code contracts/` if `contracts/` changed.
6. `git diff --check origin/main...HEAD`.
7. **Owned-paths check:** every path in `git diff --name-only origin/main...HEAD` must match the package's owned paths or `docs/handoffs/<ID>.md`.
8. **Secret and path scan** over the diff:
   - home or user directories;
   - drive letters;
   - private IP ranges;
   - `api_key=`, `Bearer `, `TDN_*=` with a value;
   - 32+ character key-like strings outside test literals.
9. **Commit check:** the commit messages carry the package ID.

## 7. Phase 0 spike (#124): owner-approved 2026-10-07, ≤6 paid calls

- **Where:** run once, on the machine that holds the SerpApi key. This is not a package and makes no repo change.
- **Calls:**
  - 3 × `google_trends`, from `planTrendsRequests(['bình giữ nhiệt'])`;
  - 3 × `google`, from the first 3 of `buildExpandedQueries({ confirmedProducts: ['bình giữ nhiệt'], confirmedBrands: [] })`;
  - all through `SearchCallBudget({ trends: 3, search: 3 })` and `defaultProviderTransport`;
  - no retries. A failed call still counts.
- **Never print the key.** Raw responses stay in a private local folder.
- **Check:**
  - `parseTrends` gives non-null facts for each type;
  - whether `search_parameters.q` is present (the RELATED_QUERIES and GEO parsers require it);
  - the point cadence and the `"<1"` values;
  - the region field names;
  - the share of on-topic results among the expanded-search results.
- **Output:** a short private note in plain Vietnamese with **GO** or **FIX FIRST** (the exact parser changes). GO, or the fixes recorded, unblocks P5.

## 8. Push and draft PR (runner)

- **Push:** push only `pkg/<id>-<slug>`, with credentials **outside** the worker environment. Never push `main`, never force-push.
- **Draft PR** into `main`:
  - title `[<ID>] <package name>`;
  - label `agent-pipeline`;
  - body: the handoff, including the evidence table; "Part of #124/#125/#127" as applicable; the round count.
- **Never merge.** Never enable auto-merge.

## 9. Final review on GitHub (Claude Code cloud)

**Trigger:** a scheduled routine, or the owner asking. It processes draft PRs labelled `agent-pipeline` whose head changed since its last review.

For each PR:
1. Check out the head and run the gates (§6) on Linux.
2. Verify every checklist ID against the diff.
3. Post **one** PR comment that starts with `PIPELINE-REVIEW: PASS` or `PIPELINE-REVIEW: CHANGES`.
   - CHANGES lists the findings in the §5 JSON shape inside a fenced block.
4. On PASS: mark the PR ready for review and notify the owner ("sẵn sàng merge").
5. On CHANGES: the runner reads the comment, starts a worker round on the same branch, re-runs §5–§6, and pushes. The PR updates, and the next final review runs.

## 10. Keeping branches current

- After any merge to `main`, the runner merges `origin/main` into every open package branch.
- **Conflicts:** run a worker round with the instruction "resolve the merge conflict, keep both behaviours". Ask the owner only when both sides changed the same logic and picking one loses behaviour.
- Regenerate generated files with the repo's tools, never by hand.

## 11. Limits and notifications

- **Concurrency:** at most 4 packages in WORKING at once. One package per worktree.
- **Time:** a worker round is capped (e.g. 4 h). A test run is capped at 20 min.
- **Owner notifications:** only for READY_FOR_OWNER, BLOCKED (with the reason and the decision needed), and a needed owner gate. No per-round chatter.
- **Paid or live actions** (provider calls, Metric search/export, PageIndex upload, deploy): never inside a package. Always an explicit owner yes.
