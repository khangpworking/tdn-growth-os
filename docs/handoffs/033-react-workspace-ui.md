# Task 033 — React workspace UI handoff

## Implemented frontend behavior

Task 033 converts the approved `docs/frontend/workspace-prototype.html` into a React 19 + Vite 8 + TypeScript 5.9 frontend demo. All state is typed, synthetic, held only in browser memory, visibly labelled as demo data, and restored to the seed on reload/reset.

- Preserves `All markets → Market discovery workspace → Independent product workspace` with direct hash URLs and browser back/forward navigation.
- Market portfolio shows counts, name/keyword search, search-empty state, and creation of an empty demo research workspace. Market identity and relationships use IDs; duplicate names/keywords are allowed.
- Market workspace contains its own discovery context, candidate basket, product list, market switching, product search, and empty-product state.
- Product workspace implements the approved B8 dossier layout and four independent Legal, Scientific, Quality, and Finance lanes.
- PASS, HOLD, and REJECT demo decisions require no reason and append immutable in-memory history for only the selected product.
- Four current PASS states enable one demo B9 clearance snapshot. That historical clearance remains visible if a lane changes afterward.
- B9 and B10 remain informational only. No STP form/lock, B10 execution, API, authentication, database, provider, collection, or real business decision exists.
- Includes normal, search-empty, workspace-empty, loading, error, malformed/invalid route, desktop, and mobile states; visible focus and reduced-motion support.

## Exact commands

```bash
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run frontend:typecheck
npm run frontend:build
npm run frontend:test
npm run frontend:dev
npm run frontend:preview
npm run check
npm run frontend:dev -- --host 127.0.0.1
```

`frontend:dev` serves the source app; `frontend:preview` serves the production build. The existing root `npm run check` now includes frontend contract-independent typecheck, production build, and focused state/routing tests without weakening backend checks.

## Changed paths

- `frontend/index.html`
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/model.ts`
- `frontend/src/routing.ts`
- `frontend/src/styles.css`
- `frontend/tests/state-routing.test.ts`
- `frontend/tsconfig.json`
- `frontend/vite.config.ts`
- `docs/frontend/screenshots/task-033/*`
- `docs/handoffs/033-react-workspace-ui.md`
- `docs/STATUS.md`
- `.gitignore`
- `package.json`
- `package-lock.json`

No migration, backend source, canonical schema, or generated contract is changed.

## Verification

- Frontend TypeScript strict check: PASS.
- Vite production build: PASS.
- Focused reducer and route tests: PASS, including duplicate market names with distinct IDs, product/market isolation, append-only history, four-PASS clearance, historical clearance retention, reset, valid routes, relationship mismatch, and malformed URL handling.
- Browser walkthrough against the production build: PASS for multiple markets, search/search-empty, empty-market creation, market switch, product open, browser back/forward, all four B8 updates, clearance, post-clearance HOLD with retained snapshot, B8 history, reload/reset, loading/error/empty views, and invalid route.
- Browser console/page errors: none.
- Responsive inspection: PASS at 1440 px desktop and 390 px mobile, with no mobile horizontal overflow and the approved three-column dossier stacking into content then decision controls.
- Final root `npm run check`, `git diff --check`, immutable-boundary checks, residue scan, PR/CI/head checks: recorded in the final draft-PR handoff comment.

## Screenshots and prototype comparison

- `docs/frontend/screenshots/task-033/portfolio-desktop.png`
- `docs/frontend/screenshots/task-033/empty-market-desktop.png`
- `docs/frontend/screenshots/task-033/product-b8-desktop.png`
- `docs/frontend/screenshots/task-033/product-b8-mobile.png`

The screenshots were inspected against `docs/frontend/workspace-prototype.html` at matching 1440 px and 390 px widths. They preserve its dark operational header, persistent synthetic warning, restrained blue/teal status palette, overview tables/cards, step strip, three-column B8 dossier, lane states, and mobile stacked hierarchy. No discarded Coinbase, Meta, Apple, or HP direction was used.

## Remaining API/backend gaps

This is deliberately a frontend demo only. Browser state is not persisted and no backend module is imported. Real market creation, evidence/report retrieval, B8 governance writes, clearance creation, B9 working STP and locking, B10 decisions, authorization/authentication, database access, provider collection, error transport, and deployment remain future integration work. The future UI must consume explicit IDs and verified backend readers/contracts rather than infer relationships from names.
