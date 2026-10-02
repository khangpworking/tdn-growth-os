# Research automation browser acceptance (synthetic only)

## Actual owner-boundary journey

`tests/helpers/research-automation-web-acceptance.ts` runs the built production frontend against the real operator with a disposable synthetic database, local test OWNER and no provider configuration. It must not attach to the active operator or use real credentials.

On isolated Fedora/Linux it passed:

- PRODUCT and CATEGORY modes; unknown interview answers remain unknown.
- 365-day default and custom 360-day inclusive period.
- Explicit start, authoritative empty-source scope, and explicit scope confirmation.
- Separate Market and Insight web report tabs and truthful PDF-unavailable guidance when no renderer is configured.
- Reload preserves the run and saved outputs.
- 390×844 mobile run has no horizontal overflow.
- Demo route issues no API request; no external provider request occurs.

The helper closes its owned operator/browser and removes its disposable fixture. It writes screenshots and `acceptance.json` only to the explicitly supplied outside-Git output directory.

## Reproduce on Linux

Use the pinned project Node runtime, installed project dependencies and a production build. `playwright-core` is supplied by an external runner directory, not a new project dependency.

```bash
npm run frontend:build
TDN_AUTOMATION_WEB_DIR=/absolute/outside-git/acceptance \
TDN_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
NODE_PATH=/absolute/browser-runner/node_modules \
node --import tsx tests/helpers/research-automation-web-acceptance.ts
```

Do not run this on Windows. The helper uses its own loopback port; it does not restart port 8787.

Actual acceptance evidence from this implementation is at:

```text
/home/pkhang/.cache/tdn-auto-v1-BHHCkn/screenshots/
C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/automation-v1-browser/
```

Files: `research-editor-desktop.png`, `research-scope-empty-desktop.png`, `research-run-mobile.png`, `research-demo-mobile.png`, `acceptance.json`. The earlier `research-run-mobile-overflow.png` is pre-fix diagnostic evidence, not the accepted mobile result.

## What this does not prove

This no-provider journey does not prove paid-provider availability, live card quality, or completed analytical methods. Synthetic provider/API tests own normalized card and exact evidence-binding behavior. PDF-enabled backend integration tests separately verify two actual PDFs; the browser walkthrough intentionally verifies missing-renderer UX.

Claude “Competitor mockup report design” reviews only the rendered Market/Insight reports (web/PDF), then the owner accepts those report designs. The session is not an audit/approval gate for the automation application UI or whole feature. Browser functionality is not report-design approval.
