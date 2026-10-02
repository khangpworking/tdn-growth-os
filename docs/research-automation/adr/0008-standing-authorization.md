# 0008. Standing authorization, spent only by "Bắt đầu nghiên cứu"

- **Status:** Accepted (Astra rounds 1–2, round 3 AGREED); monetary-ceiling requirement and no-live-authorization statement superseded by [0015](0015-owner-scope-cards-period-and-output.md). Original decision text retained below.
- **Date:** 2026-10-01

## Context

The quick search calls providers **before** the market definition is approved, so the definition approval can't authorize it. A confirmation before every run would be tedious. Calls must also never happen as a side effect of page loads or keystrokes. In tgos, provider calls need explicit owner authorization.

## Decision

- The owner grants a **standing authorization** once. It names:
  - the permitted adapters and operations;
  - the data classes that may be submitted;
  - the call and spend limits.

  It authorizes actions, not just a spending ceiling.
- The explicit **"Bắt đầu nghiên cứu"** action is the only thing that spends it. Nothing calls a provider on page load or while the owner types.
- **Approving the definition** ("Duyệt định nghĩa", then "Xác nhận và bắt đầu") authorizes the **full crawl** for that definition only. It never retroactively authorizes the quick search.
- Limits are enforced across retries and resumed attempts. Changing the scope starts a new run.
- There is no extra confirmation per run within the standing authorization.

## Consequences

- An authorization record and a budget ledger are needed, keyed by run and attempt.
- The prototype no longer shows the permissions table ("Trong quyền đã cấp" was removed in v3 at owner request), but the cap is still enforced in code. The confirm dialog still shows the calls and the cost cap for the chosen report.
- No live provider is authorized today. Slice 1 runs on a synthetic fixture until it is.
