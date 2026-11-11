# Shopee 1111 run labels and collected-comment export

Date: 2026-11-11

Branch: `wp/shopee-1111-run-label-export`

Base: `6075386fbfc5d5e65c94013b20aeaf51c2051927`

## Status

Desktop UI and Python bridge work is complete and locally checked in scoped commits on this branch. Sol still owns the backend production code, canonical contracts, migrations and backend integration tests. Root owns integration, merge, Windows packaged QA and Astra review. Nothing was pushed, merged, deployed, imported, or pointed at a production database or live source.

## Approved operator behavior

### Run names

- The run list and detail title use the primary search keyword plus the first accepted launch time, for example `viên uống kẽm: 11/11/2026 11:26am`.
- Time is displayed in Vietnam time (`Asia/Ho_Chi_Minh`) with lowercase `am`/`pm` and no space before the suffix.
- The opaque run ID remains visible as secondary text.
- A rerun or later attempt keeps the original run name.
- A completed legacy run whose first launch is unknown shows `chưa rõ giờ bắt đầu`, not a false `Chưa chạy`.
- `Chưa chạy` is shown only when the run has honest no-launch evidence.

### Save and export panel

- Every M3 card shows a panel titled exactly `Lưu và xuất bình luận` after collection. It is shown independently of whether the current M2 input is readable.
- The panel has exactly three actions: `Lưu vào DB`, `Xuất JSON`, `Xuất TXT`.
- It uses stored settled collection evidence only. It never reruns Metric, Shopee, or a collector, and opening or refreshing the panel never saves or downloads anything.
- The operator selects one exact stored source. The selection survives refreshes while that source exists. If it disappears, the panel clears it and asks for a new selection instead of silently switching sources.
- Save sends exactly `{sourceSha256}`. Export sends exactly `{sourceSha256, format}`.
- JSON and TXT availability are controlled separately by the source's per-format availability. Under the read-only guard, a new DB save and new JSON/TXT generation are blocked; only an exact export that already has a cache receipt remains downloadable. The panel shows that blocked reason or the cached receipt.
- The older M3 review-plan save and exact-attempt stop/reconcile controls are separate sampling controls. They are not a DB import or a comment export.

### Export file safety

- `Xuất JSON` and `Xuất TXT` open a native Save As dialog. Only the sanitized suggested base name crosses into the dialog; the page never supplies a filesystem path.
- The bridge streams the export through the private `read-review-export` route, accepts at most 64 MiB, verifies the declared byte size and SHA-256, and writes to a temporary `.part` file in the destination folder.
- The chosen destination is replaced only after the complete stream passes both checks. A mismatch, remote error, spawn failure or cancel leaves the existing destination intact and leaves no `.part` file.
- Cancel is returned as a normal result, not an error. Raw export bytes and filesystem paths never reach the page, logs, or error text.
- Static remote errors are mapped to fixed codes. Stderr parsing is bounded to 64 KiB; the bound also applies to the streaming path.

## Changed paths (desktop ownership)

- `tools/shopee-desktop/index.html`
- `tools/shopee-desktop/tdn_shopee_app.py`
- `tools/shopee-desktop/BUILD.md`
- `tools/shopee-desktop/tests/test_review_data_bridge.py`
- `tests/integration/shopee-desktop-ui.test.ts`
- `.github/workflows/check.yml`

Sol-owned backend paths and the canonical schema/generated types were read but not edited.

## Checks

- `python3 -m py_compile tools/shopee-desktop/tdn_shopee_app.py tools/shopee-desktop/tests/test_review_data_bridge.py` - passed.
- `PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning -m unittest discover -s tools/shopee-desktop/tests -p 'test_*.py' -v` - 25 passed.
- Node 24.15.0 (`/home/pkhang/lanes/shopee-1111-review-sampling/tools/with-node24.sh node --test tests/integration/shopee-desktop-ui.test.ts`) - 22 passed.

The new desktop tests cover:

- the exact `11/11/2026 11:26am` label, the legacy unknown label, and the honest unstarted label;
- panel availability without readable M2, source selection stability and reselection after loss;
- exact save/export payloads, per-format unavailability, read-only display and no automatic action;
- native dialog arguments and cancel, exact JSON/TXT bytes, sanitized filenames;
- digest mismatch, truncation, bounded stderr, spawn failure and stdin failure with the old destination preserved and no temporary file left behind.

## Synthetic packaged QA guidance

The desktop fixture suites are Linux/POSIX tests. Their `sshCommand`, `remoteScript`, `runsRoot` and fake remote use local POSIX paths; running the same suites on Windows turns those into `C:\...` paths and correctly fails remote path validation. Do not weaken the production validator to make them pass, and do not claim they passed on Windows. The fake remote in `tools/shopee-desktop/tests/test_review_data_bridge.py` is a reference only for the bridge contract; it records argv/stdin and emits synthetic canonical bytes.

- Packaged Windows QA uses a real SSH connection to an isolated Fedora fixture with fixed synthetic runs, presets, state, temporary migrated database and artifact root. It must never use the real runs folder, presets folder, production database, or shared guard.
- On Windows, verify the packaged PyInstaller window/WebView2 rendering, native Save dialog, cancel, overwrite confirmation, and a known digest/size failure manually.
- Windows packaging and native-dialog QA remain pending until that real Windows run completes.

## Remaining integration

- Root integrates the desktop changes with Sol's backend revision-1 routes and canonical fixtures, then runs Astra review and the full CI gate.
- The backend CLI behavior and real Windows native dialog were not exercised in this Linux worktree.
- Do not merge or deploy from this handoff alone.
