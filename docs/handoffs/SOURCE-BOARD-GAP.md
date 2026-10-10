# Source board gap: TikTok comments cap copy

## Gap

When the TikTok comments collector is not wired but the token and a positive spend cap are present, the card said the cap was missing. The cap was set, so the copy was false.

## Fix

`SourceStatusBoard.tsx` now shows "Đã có token và hạn mức chi, nhưng bộ thu chưa sẵn sàng nên không tự thu." when `spendCapUsd` is positive. The missing-cap copy is unchanged for other cases. Backend status mapping, caps, auth and contracts are unchanged.

## Proof

- `frontend/tests/research-source-status.test.ts`: positive-cap case added. Pre-fix run exits 1, fixed run exits 0 (4 of 4 pass).
- Run on Node v22.23.2. The pinned Node 24.15.0 binary was not found on this host, so the run is not on the pinned runtime.
- Mounted app and API proof not run in this pass.
