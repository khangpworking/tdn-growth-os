# Citation presentation option on the live report surface

Follows [report-citation-preview-surface.md](report-citation-preview-surface.md). It adds one choice when creating a new report version. It is not a new visual direction. It does not change the Vietdata market / YouNet ECI insight presentation or the app shell.

Design read: Read/Operate owner tool in the existing TDN workspace style. Dial ENERGY 2 / RHYTHM 2 / MOTION 1 (no new motion).

## What the owner sees

In **Tạo báo cáo mới**, below the source and the optional method profiles, a radio group **Cách trình bày báo cáo** offers:

| Option | API value | What it says it does |
|---|---|---|
| Báo cáo chuẩn (default) | `report-kit-v1` | The current Market and Insight layout, without reference numbers. |
| Báo cáo có số tham chiếu nguồn | `report-kit-citations-v1` | The same layout, plus [1], [2] next to facts that have stored sources. Each number opens the stored calculation result, then the row/cell location in the source file. Facts without enough sources get no number. No new figures and no AI interpretation are added. |

A note under the options says the choice applies only to the report being created now; saved versions keep the presentation they were created with and are not re-rendered.

The choice is sent explicitly every time, including the default. It locks with the rest of the request while the request is pending, after an error and after completion, so a retry resends exactly the same presentation. **Yêu cầu đã gửi** shows a **Cách trình bày** row whenever the citation option or method profiles were sent. Workspace changes and **Chọn nguồn cho báo cáo khác** reset the option to the default.

Changing only the source picker preserves the presentation choice. Method selections reset because they bind a particular package; the layout preference itself is not a source identity.

## What did not change

- Report list, version history and exact version selection: no automatic newest version, no re-render. **Mở report và evidence** and **Tải packet JSON** still open the exact stored artifacts of the chosen version.
- Empty, loading, error, locked OWNER and read-only states. Demo mode still has no report creation and no fake report.
- No PageIndex query box, OCR, upload, paid action or provider call. Citation numbers come only from the backend renderer's deterministic projection of retained calculation and source locations. The UI writes no reference content.
- One CSS rule (`.report-presentation-option`) lays out each radio row: radio on the left, label and description aligned to the right of it, 44px minimum tap target. No new colors, fonts or assets.

## Integration dependency (backend owner)

- `ResearchGenerationRequest.reportPresentation?: 'report-kit-v1' | 'report-kit-citations-v1'` in `contracts/api/research-generation-api.*`. The panel derives its option type from this field, so typechecking fails if the field or the citation value is missing. No casts were added.
- The research-generation service must pass the requested value through to the immutable version, use the deployable citation renderer (not `report-kit-citations-preview-vi-v1` with its design-review banner) and replay an exact retry with the stored presentation.
- An unsupported value currently comes back as a 400. The client maps that to the generic source error copy. That is acceptable only while the frontend and backend ship together.
- Inline `report.html` download/preview must keep working for citation versions. That includes bundled fonts and the `citations.json` link inside the register.

Optional later step, not required for this option: expose the stored presentation on `ReportVersionSummary` so the version summary can name it before opening.

## Acceptance

Linux only: `npm run frontend:typecheck` and `node --import tsx --test frontend/tests/research-report-create.test.ts frontend/tests/research-reports.test.ts`. Final design judge: the Claude session **Competitor mockup report design**. Final approver: owner.
