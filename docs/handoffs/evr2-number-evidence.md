# Handoff — EVR2 number evidence

Updated: 2026-10-27
Worktree/branch: treehouse tdn-growth-os-43e4a4/1, fm/evr2-number-evidence
Completed: opt-in capture packages, hash-verified R2 copies, separate evidence index, OWNER GET and read-only MCP tools. No migration, dependency, HTML or trace format change.
Changed paths: contracts/analysis/metric-v3-evidence.schema.json; research-automation capture/service/model/report identity export; platform/artifacts/r2-metric-evidence.ts; API configuration/routes; tools/opencli-metric/clis/metric/v3-{capture,evidence}.js; tools/mcp-market.
Evidence (commands, results, relevant revision): npm run typecheck passed; existing v3 capture/report checks passed (14 passed, 2 Chromium skips); capture-runner/legacy replay checks passed (27); MCP pytest passed (25 tests, 69 subtests). Acceptance tests are separately owned.
Unresolved: no live source/R2 verification. Request-only fallback cannot illustrate results absent from the page: NO_IMAGES/EVIDENCE_REQUEST_CAPTURE is explicit. Template labels have source=template, EVIDENCE_TEMPLATE_NUMBER, no invented source image.
Next action: separate test worker covers A1–A6 and negative controls, then separate exact-head review. Never merge/deploy from this task.
Business decisions pending: no rule changed. Pre-existing R-P10 gap: prepareV3MarketRevision in src/modules/analysis/research-automation/reader-publish.ts stores pre-gated v3 HTML directly, unlike the legacy Flint/Reader lint sequence described by the spec; preserved here.

Test seams: writeV3EvidencePackage(page, {windowDir, manifest, rawBytes}) accepts a fake page and synthetic PNG; retainEvidencePackages accepts EvidenceStore plus local artifact retain; R2MetricEvidenceStore accepts an S3Client with fake request handler and synthetic credentials. buildNumberEvidenceIndex/assertNumberEvidence consume existing P4 trace and verified archive; remove one ref for the P5 negative control. ResearchAutomationService accepts metricEvidence.store and exposes readNumberEvidence(workspaceId, revisionId, numberRef); OWNER route is /owner-api/workspaces/:ws/research-automation/reports/:revision/numbers[/:ref]. MCP _evidence_get uses HTTPConnection, never a write gate or token mint. Stored v1/v2 render/replay remain unchanged; test both exact old HTML/trace and PDF read/download separately.
