# 0012. Confirm dialog with report choice

- **Status:** Accepted (owner, 2026-10-01, v2); mandatory cost-cap display superseded by [0015](0015-owner-scope-cards-period-and-output.md). Original decision text retained below.
- **Date:** 2026-10-01

## Context

Approving the definition used to start the full run at once. The owner wanted a confirmation before the loading screen, and the option to produce only one of the two reports. A smaller run saves calls and time.

## Decision

- "Duyệt định nghĩa" on step 5 opens a confirm dialog. It shows:
  - a product summary, the data volume and the confirmed competitors;
  - a choice of **Cả hai** (the default), **Chỉ Thị trường** or **Chỉ Insight**;
  - for each choice: its sources, calls, cost cap, time estimate, and which sections will have content and which will be blocked.
- "Xác nhận và bắt đầu" starts the run. "Quay lại sửa" or Esc closes the dialog.
- The run screen (step 6) is filtered to the chosen report: its sources, log lines, section grid, caps and citations.

## Consequences

- The run record stores the chosen report set. Budget and adapter selection follow from it.
- Demo figures: Market only is 2 sources, 13 sections and 80 calls; Insight only is 4 sources, 17 sections and 140 calls; both are 4 sources, 30 sections and 180 calls. These are prototype numbers, not estimates.
