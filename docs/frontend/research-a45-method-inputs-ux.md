# A45 UX brief: explicit method inputs on the report creation form

Status: static design brief, 2026-10-01. Nothing here has been implemented, built, tested or opened in a browser. The UI lane implements it; root owns contracts; the service lane owns inventory and error mapping.

Scope: one optional fieldset added to the existing `ResearchReportCreatePanel` (A42). The operator shell, the report-kit HTML and the report layout stay as they are. Direction is unchanged (ENERGY 1 / RHYTHM 2 / MOTION 1, Operate mode). No new tokens, fonts, icons, images, modal or motion.

Inputs read: `AGENTS.md`, `INTENT.md` (A45 entry), `docs/tasks/research-a45-web-method-inputs-plan.vi.md`, `DESIGN.md`, `docs/handoffs/research-a42-web-generation.md`, `contracts/api/research-generation-api.schema.json` (working tree), `frontend/src/ResearchReportCreatePanel.tsx`, `frontend/src/research-generation-client.ts`, `src/api/research-generation-api.ts`, the in-progress `discoverMethodInputs` in `report-generation-service.ts`, and the `.report-*` rules in `frontend/src/styles.css`.

## 1. Placement

Inside the existing `<form>`, in this order:

1. Source `<select>` (unchanged).
2. Source details `.report-message` (unchanged).
3. **New** `<fieldset className="report-method-inputs">`, rendered only when the loaded inventory choice has `methodInputs`.
4. `.report-actions` with the submit button (unchanged position).

After the form and before the existing pending/error/done messages: **new** read-only "Yêu cầu đã gửi" `<dl>`, shown only after submit (section 5).

If the inventory has no `methodInputs` field at all (older server), render nothing new and send the pre-A45 request body unchanged.

## 2. Controls and defaults

One native `<select>` per family, using the existing `.report-version-picker` label pattern (label wraps the select, full width). Families appear in this fixed order:

| Family key | Label | Hint (`<small>` inside label) |
|---|---|---|
| `descriptiveMethods` | Phương pháp mô tả thị trường | Bổ sung cho phần Thị trường. |
| `locatedInsightMethods` | Phương pháp Insight gắn vị trí bằng chứng | Bổ sung cho phần Insight. |
| `methodPackets` | Gói kiểm tra điều kiện và tổng hợp | Bổ sung bước kiểm tra điều kiện và phần tổng hợp. |

Options:

- First option `value=""`, text **Không dùng**. Always the initial value, including when the family has exactly one candidate. Never preselect, never mark a candidate as recommended, never reorder beyond the server order (logical path).
- One option per candidate: `value = methodSelectionId`, text = `logicalPath`. Do not show the ID, digest, schema name, `eligibility` value or limitation codes in the option text.
- The same file can legitimately appear in two families (the server checks each schema separately). Show it in each family; selections are independent.

Under a select whose value is a candidate: `<small>File: {logicalPath}</small>` with `overflow-wrap:anywhere`. This repeats the name in full because closed native selects truncate long paths on narrow screens.

Below the three rows, when at least one candidate is chosen: one list **Lưu ý về hồ sơ đã chọn** built from the union of the chosen candidates' `limitations`, de-duplicated, in first-seen order. If a code applies to only some chosen families, append the family label in parentheses. Copy map:

| Code | Vietnamese line |
|---|---|
| `SCHEMA_VALIDATED_ONLY` | Hệ thống mới nhận ra đúng loại hồ sơ, chưa xác nhận hồ sơ phù hợp với bộ dữ liệu này. |
| `PACKAGE_RELATION_NOT_DECLARED` | Package chưa ghi hồ sơ này được lập cho bộ dữ liệu nào. |
| `CONSUMER_VALIDATION_ON_CREATE` | Khi tạo, hệ thống đối chiếu hồ sơ với nguồn. Nếu không khớp, báo cáo không được tạo và form báo lại lý do. |
| any other code | Có thêm giới hạn chưa có mô tả ({code}). |

Unknown codes stay visible: hiding them would drop a server-stated limitation.

Fieldset header copy:

- `<legend>`: **Hồ sơ phương pháp bổ sung (không bắt buộc)**
- `.report-limit` under it: Chỉ lấy từ package của nguồn đã chọn. Mỗi loại mặc định là Không dùng.

## 3. States

All states reuse existing classes: `.report-limit`, `.report-message`, `.report-message.error`, `.report-prompt`, `.button`.

| State | Condition | What renders |
|---|---|---|
| OWNER locked / writes off | `!writesAvailable` or `!ownerToken` | Existing prompts only. No fieldset. |
| Inventory loading | `loadState === 'loading'` | Existing "Đang kiểm tra danh sách nguồn đã lưu…" status. Candidates arrive with the inventory, so there is no per-family spinner. |
| Inventory error / integrity | client validation fails (incl. new duplicate-ID check, section 7) | Existing error block with "Tải lại nguồn". No form. |
| No source chosen | inventory ready, `selected` undefined | Fieldset with legend and one line: Chọn nguồn trước. Hồ sơ phương pháp chỉ lấy từ package của nguồn đó. No selects. |
| Family has no candidate | that array is empty | Label + muted line: Package này chưa có hồ sơ loại này. No select for that family. |
| No candidate in any family | all three arrays empty | Fieldset body is one `.report-message`: **Package này chưa có hồ sơ phương pháp bổ sung** / Báo cáo vẫn tạo được như hiện nay. Muốn dùng hồ sơ, nhập lại package có kèm file hồ sơ bằng công cụ intake hiện có, rồi tải lại nguồn. / button **Tải lại nguồn** (same `setReload` as today). |
| One or many candidates | array length ≥ 1 | Select per section 2, value **Không dùng**. |
| Pending | `status === 'pending'` | All selects `disabled` (same `lockedOperation` flag as the source select). Snapshot `<dl>` visible. Pending line: Đang xác minh nguồn, hồ sơ đã chọn và lưu báo cáo. Chỉ gửi một yêu cầu; thao tác này không gọi AI. (Keep the current A42 line when every family is Không dùng.) |
| Connection / unconfirmed | `failure.kind === 'connection'` | Existing message. Retry note becomes: Yêu cầu, nguồn và hồ sơ đã chọn đang được giữ nguyên. Thử lại để xác nhận kết quả, tránh tạo bản trùng. Button **Thử lại cùng yêu cầu** resends the frozen body. |
| Conflict (409) | source or candidate no longer resolves, or request key bound to another selection | Nguồn hoặc hồ sơ đã chọn không còn khớp với package đang lưu. Chọn lại rồi tạo yêu cầu mới. Button **Chọn lại nguồn** (existing `chooseAgain`). |
| Method rejected | consumer rejects a chosen file's lineage or claims (needs a distinct server code, see Q1) | **Hồ sơ phương pháp không khớp với nguồn** / Hệ thống đã dừng và chưa tạo báo cáo. Đặt {family label} về Không dùng hoặc chọn hồ sơ khác trong package, rồi tạo yêu cầu mới. Button **Chọn lại nguồn và hồ sơ** (`chooseAgain`). If the server does not name the family, use "hồ sơ đã chọn". |
| Integrity failure | 500 `integrity_error`, malformed or mismatched receipt | Bằng chứng lưu trữ chưa vượt qua kiểm tra toàn vẹn, nên chưa xác nhận được báo cáo. Thử lại cùng yêu cầu; nếu vẫn lỗi, cần kiểm tra package và kho lưu trữ. Retry keeps the frozen body. |
| Done | receipt verified | Existing success line, plus when ≥1 family was chosen: Đã gửi kèm {k} hồ sơ phương pháp. Mở báo cáo để xem phần nào có kết quả và phần nào còn thiếu dữ liệu. Keep "Bản nháp chưa duyệt." Selects stay disabled until **Chọn nguồn cho báo cáo khác**. |

Missing data versus corrupt lineage, stated once for implementers:

- A package without candidates, a family set to Không dùng, or a chosen file that covers only some sections is normal. Creation succeeds; the report itself shows unavailable sections. Never use error styling for it.
- A chosen file whose claims or locators do not match the source is a **method rejection**: actionable, not retryable with the same request, no integrity wording.
- Stored bytes or evidence failing verification is an **integrity failure**: retry with the same request, no "thiếu dữ liệu" wording.
- The success copy never says a method "đã chạy" or "đã áp dụng". The receipt does not report which supplements produced output; the report is the authority.

## 4. Clearing rules

All three family values reset to `null` when any of these happens:

1. The source select changes to any other value, including another workbook in the same package. Candidates are attached per choice and no package declares which method file belongs to which workbook, so a carried-over pick would be an implicit choice.
2. Workspace changes (existing reset).
3. `chooseAgain` (existing reset; also starts a new request key).
4. After an inventory reload in the idle state, a stored ID no longer appears in the current choice's family array: reset only that family.

When rule 1 or 4 resets a value that was not already `null`, announce it in a polite live region inside the fieldset (render the element permanently, change only its text):

- Rule 1: Đã đặt lại hồ sơ phương pháp về Không dùng vì nguồn đã đổi.
- Rule 4: Hồ sơ đã chọn không còn trong package sau khi tải lại; đã đặt về Không dùng.

Do not move focus on these resets.

While a request is pending, errored or done, inventory reloads (for example after an OWNER session change) never touch the frozen request or snapshot.

## 5. Submission snapshot

On the first submit of an operation, build two frozen objects together and keep them in refs next to `operation.current`:

```ts
// request body: exactly what goes on the wire, reused byte-for-byte on retry
Object.freeze({
  contractVersion: '1.0.0', workspaceId, selectionId, requestKey: crypto.randomUUID(),
  ...(selected.methodInputs ? { methodSelectionIds: Object.freeze({ ...methodIds }) } : {}),
});
// display snapshot: labels captured at submit time, never re-derived from inventory
Object.freeze({ source: `${sourceLabel} · v${packageVersion}`, period, families: { descriptiveMethods: logicalPath | null, ... } });
```

- When the inventory advertises `methodInputs`, always send all three keys, with `null` for Không dùng. That records the explicit "none" decision. When it does not, omit the field so the body matches A42 exactly.
- The body never contains a path, digest typed by the user, or anything from the inventory except the opaque IDs.
- Retry, OWNER re-unlock and inventory reload reuse the frozen body. The current select values are ignored until `chooseAgain` clears the operation.
- No confirmation modal. The action creates a new unreviewed draft version and an exact retry is idempotent, so the selects themselves are the confirmation and the snapshot shows what was sent.

Snapshot rendering: heading `<h5>` or `<strong>` **Yêu cầu đã gửi**, then a `<dl>` inside the section (the existing `.report-version-summary dl` grid styles apply). Rows: Nguồn; Kỳ dữ liệu; then the three family labels with the logical path or **Không dùng**. Shown during pending, error and done.

## 6. Keyboard and mobile

- Tab order: source select, each family select that exists, "Tải lại nguồn" when shown, submit. Native `<select>` handles arrow keys and type-ahead. No custom listbox, no `tabindex` changes.
- Each select gets its label through the wrapping `<label>`; the hint and `File:` line are tied with `aria-describedby`. The fieldset `<legend>` names the group for screen readers.
- Focus ring: existing teal outline. Do not add focus styles.
- Disabled selects leave the tab order while locked; the snapshot `<dl>` carries the values for reading.
- After `chooseAgain`, the clicked button unmounts. Move focus to the source select once the reloaded form renders, so keyboard users are not dropped to `<body>`.
- Errors keep the existing `role="alert"`; pending and done keep `role="status"`.
- At ≤760px the existing rules already stack `.report-actions` and make buttons full width; the dl becomes one column. Selects are already `width:100%`. Long logical paths wrap in the `File:` line and the dl (`overflow-wrap:anywhere`), so nothing scrolls horizontally at 360px.
- Existing selects use 13px text, which iOS Safari zooms on focus. The new selects match the existing picker; changing that is outside this task.

## 7. Implementation constraints

CSS: one small scoped block, modelled on `.campaign-items` / `.tiers`; no new tokens.

```css
.report-method-inputs{display:grid;gap:12px;min-width:0;margin:16px 0 0;padding:16px 0 0;border:0;border-top:1px solid var(--line)}
.report-method-inputs legend{float:left;width:100%;padding:0;font-size:13px;font-weight:700}
.report-method-inputs small{display:block;color:var(--muted);font-weight:400;overflow-wrap:anywhere}
.report-method-inputs ul{margin:0;padding-left:18px;color:var(--muted);font-size:12px}
.report-version-summary dd{overflow-wrap:anywhere}
```

Component state, smallest version:

- `methodIds: ResearchGenerationMethodSelectionIds` state, initial all `null`; `''` in the select maps to `null`.
- The source `onChange` sets `selectionId` and resets `methodIds` in the same handler (rule 1). An effect handles rule 4.
- Derive chosen candidates by looking up IDs in `selected.methodInputs[family]`; never look across choices or packages.

Client (`research-generation-client.ts`):

- Inventory check: within each choice, `methodSelectionId` values must be unique across all three families (the ID includes the family). A duplicate is an `integrity` error: Danh sách hồ sơ phương pháp có định danh bị trùng.
- Error mapping currently reads only the HTTP status. Read `error.code` from the JSON body so a method rejection gets its own kind (for example `'method'`) instead of falling into `integrity` or `source`. Keep status-only fallbacks for unknown codes.

Not in this lane: uploads, choosing files from another package, auto-pairing, ranking, compatibility scoring, AI calls, approval controls, persistence of the pending request across a full page reload (A42 limitation stays).

## 8. Acceptance matrix (real UI boundary)

"Mounted" means the existing mounted-component test style with HTTP response fixtures. "Browser" means the A45 Linux browser gate against the running operator app with a fixture package. Nothing below has run.

| # | Given | Do | Expect | Where |
|---|---|---|---|---|
| 1 | Inventory without `methodInputs` | create a report | no fieldset; POST body equals the A42 shape (no `methodSelectionIds`) | Mounted |
| 2 | Choice with all three arrays empty | create | empty-package note with "Tải lại nguồn"; body has three `null`s; success | Mounted |
| 3 | One candidate in a family | create without touching it | select shows Không dùng; that key is `null` | Mounted |
| 4 | Several candidates | pick the second in one family | body has exactly that ID; no path or logical name in body | Mounted |
| 5 | Picks made | change source (same package, other workbook) | all three reset to `null`; live region text set; focus unchanged | Mounted |
| 6 | Pending | press submit twice, change selects | one POST; selects disabled; snapshot shows picked file names | Mounted |
| 7 | Connection error, then inventory reload drops the chosen candidate | retry | identical body (same request key and IDs); snapshot unchanged | Mounted |
| 8 | 409 | read message, press "Chọn lại nguồn" | conflict copy; all picks cleared; next submit uses a new request key | Mounted |
| 9 | Method rejection code | read message | rejection copy naming the family when given; no integrity wording; retry button absent | Mounted |
| 10 | 500 `integrity_error` | read message | integrity copy; retry keeps frozen body; no "thiếu dữ liệu" wording | Mounted |
| 11 | Duplicate candidate ID in inventory | load | inventory integrity error; no form | Mounted |
| 12 | Fixture package with one candidate per family | keyboard only: pick all three, submit, open report | correct version opens; reload of the history does not recalculate; done copy does not claim methods ran | Browser |
| 13 | Same as 12 at 360px wide | pick a long-path candidate | no horizontal scroll; path wraps in `File:` line and snapshot | Browser |

## 9. Delivery check for this brief

Done here: read the listed files and the Antislop core, UI and copywriting rules plus the Impeccable skill entry (its context launcher was not run). UI copy above avoids em dashes, raw codes (except the unknown-code fallback), JSON and hash terms. No code, contract, test or style file was edited; no build, test or browser check ran.

## 10. Open questions

- **Q1 (material).** The API maps consumer rejections (`ReportDescriptiveExtensionError`, `LocatedInsightValidationError`, `ReportMethodPacketsExtensionError` and similar) to the generic 500 `integrity_error` today. Without a distinct code, the UI cannot keep method rejection apart from integrity failure. Proposal for the service/contract owners: 422 with `error.code = 'method_input_rejected'` and an optional `error.family`. Until then the UI shows integrity copy for both, which breaks row 9.
- **Q2.** Server identity must treat all-`null` `methodSelectionIds` the same as an absent field when resolving method paths for retry binding; otherwise a request sent with explicit nulls could conflict with an equivalent legacy request. Code lane to confirm.
- **Q3 (minor).** The family hints ("Bổ sung cho phần Thị trường", "phần Insight", "bước kiểm tra điều kiện và phần tổng hợp") follow the consumer names. Code lane to correct them if a family feeds different report parts.

## 11. Coordinator resolutions

Q1 is implemented as a closed 422 `method_input_rejected` contract with a
required family enum and fixed safe message. Only known input-validation codes
are actionable; storage corruption, output verification and unexpected errors
remain generic 500 responses. The client validates the error before naming a
family. Q2 resolves all-null and omitted selections to the same legacy request
identity, with a mutation-free retry check at the service boundary. Q3 retains
the bounded family hints; receipt text does not claim every selected method ran.

These are code-level resolutions, not additional owner business decisions.
Linux execution and presentation evidence are recorded in the A45 handoff,
not inferred from this design brief.

## 12. Responsive correction: top bar and empty product table at 360px

Status: static decision, 2026-10-01. Inputs: `frontend/src/styles.css`, the top bar markup in `frontend/src/App.tsx`, and the Linux artifacts `research-a45-web-failure-2083cc5/failure.json` and `method-inputs-mobile.png`. No browser, build or test ran on Windows. Widths below are estimates, except where they come from `failure.json`.

Finding:

- The three method selects, the source select and the market picker all fit (right edge at most 346 of 360). Sections 2, 6 and 7 need no change.
- Top bar: `.topbar` is a single flex row that never wraps. At 360px the brand shrinks to about 106px, each nav link breaks onto two lines, and the nav still ends at 405.67px. `.owner` follows at 421.67 to 445.27px (`scrollWidth` 445). Nothing in the bar can shrink further.
- Empty product table: the visible collision is not caused by `.tools` (at ≤650px it already stacks the heading over a full-width search). The cause is the empty-state cell. At ≤650px, `.table td:last-child{position:absolute;right:16px;bottom:18px}` also matches the only cell `<td colSpan={3}>` of the empty row. That takes `.empty` out of flow, so the row collapses to its 36px padding and the message is drawn upward over the heading and search. The market list escapes this through `.market-table .table td:last-child{position:static}`. The product table in `MarketWorkspace` does not have that class.

Decision: two declaration groups, no new classes or markup.

```css
/* in the existing @media(max-width:900px) rule (line 39); replaces .topnav{margin-left:12px} */
.topbar{flex-wrap:wrap;row-gap:10px}
.brand{flex:1 1 auto;min-width:0}
.owner{flex:none;white-space:nowrap}
.topnav{order:3;flex:1 0 100%;flex-wrap:wrap;margin:0}
.topnav a{white-space:nowrap}

/* in an existing @media(max-width:650px) rule */
.table td[colspan]:last-child{position:static}
```

Resulting layout:

- Row 1: brand on the left, **Chủ dự án** on the right. They need about 230px of the 328px available at 360px.
- Row 2: all four nav links, in DOM order and full width. Each link label stays on one line. At 360px, Thị trường / Nội dung / Thương hiệu share a line and Thư viện prompt wraps to a second line. Wider phones and tablets fit all four on one line. The widest link is about 110px, so this still fits at 320px.
- `order:3` changes only the visual position of the nav relative to `.owner`. `.owner` is a non-focusable `<div>`, so tab order and reading order of interactive elements are unchanged.
- The rule goes at ≤900px rather than ≤650px. By estimate, the single row overflows from 651px up to roughly 800px as well (brand about 230px plus the 13px nav at about 390px plus the owner with its icon at about 94px). Putting it in the breakpoint that already adjusts `.topnav` closes that range without adding a breakpoint.
- The empty cell returns to normal flow. `.empty` keeps its own centred text and padding, so the heading, search and empty message stack in that order. The selector matches only full-row `td` cells: the market empty row is already static, and the Brands `colSpan` is a `th` in `.rules-table`. Populated product rows keep the absolutely positioned "Mở hồ sơ" cell.

Retained: brand mark and both brand lines, all four links with `aria-current`, the OWNER indicator text, existing colours, radii, link pills, the 650px font and padding steps, and the demo bar. Not done: no hidden or clipped overflow, no `overflow-x` scroller on the nav, no menu or disclosure, no new control or page, and no change to the browser overflow assertion or its 360px viewport.

Evidence still required (Linux gate, not here): the existing 360px assertion passes with `scrollWidth` ≤ 360 and no entry for `.topnav`, its links or `.owner`. Screenshots at 360px show the two-row top bar and an empty product table with the heading, search and message stacked without overlap. Also check one screenshot at about 768px for the mid-range estimate. The transient OWNER toast in `method-inputs-mobile.png` is fixed-position status feedback and is out of scope.

Implementation accessibility guard: the mobile nav links retain their padding
and use centred inline-flex alignment with a 44px minimum height. The three new
method selects also have a 44px minimum height. These are touch-target minimums,
not a change to the approved visual direction. The existing Linux browser
journey owns the 360px and 768px overflow evidence and the method target check.
