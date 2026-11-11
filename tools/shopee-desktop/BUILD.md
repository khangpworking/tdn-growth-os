# Build on Windows 10

Use Python 3.13, Windows OpenSSH Client, and Microsoft Edge WebView2 Runtime. WebView2 must be present on the machine running the app. The build commands below are for the coordinator's Windows machine; no packages are installed on the application host.

Put `tdn_shopee_app.py`, `index.html` and `config.example.json` in one folder. Open PowerShell there:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install pywebview pyinstaller
New-Item -ItemType Directory -Force "$env:APPDATA\tdn-shopee-flow"
Copy-Item .\config.example.json "$env:APPDATA\tdn-shopee-flow\config.json"
```

Edit that config. Replace `<user>@<host>` and `<repo>` with the owner's SSH destination and repository folder. These placeholders are intentionally unusable until replaced. Set up SSH authentication and known-host verification beforehand; `BatchMode=yes` prevents a hidden password prompt. The SSH command ends in `bash -s` so the remote POSIX script is read from stdin.

`remoteScript`, `runsRoot`, `presetsRoot` and `remoteEnvFile` accept only paths matching `^(\$HOME/)?[A-Za-z0-9_./-]+$`. Use `$HOME/` for a remote home-relative path, not `~`. Optional paths may be null. `remoteEnvFile` is optional: if present remotely, it is sourced there; the desktop never reads or displays its contents. Keep configuration outside the executable. Do not put credentials in it.

`TDN_SHOPEE_APP_CONFIG` can override the default config location with a full local file path. Config changes take effect on the next bridge call. `timeoutSeconds` defaults to 30 and must be a positive whole number.

Check the connection without opening a window:

```powershell
.\.venv\Scripts\python.exe .\tdn_shopee_app.py --check
```

This prints one JSON line and exits 0 when connected, 1 otherwise. A connected result with `readonly: true` means the guard is active; it is a valid connection. The check reads only the remote guard and runs-root setting.

## Create a run and add a product

The **Lượt mới** screen is one form: product, date period, collection policy, summary, then create. The primary button is **Tạo lượt** for an existing product and **Lưu sản phẩm và tạo lượt** when the inline new-product option is selected. Creating a run, including saving a new product first, never starts a lookup or review collection; only **Chạy cả luồng** does.

A new run is sent as `new-run-v1` input with `{presetId, endDate, collectionPolicy}`. On the wire, `collectionPolicy` has exactly four keys: `mode` (`all`, `with-comments`, `stars`), sorted unique `stars` (`1..5`, empty unless mode is `stars`), `totalPerLink` (`1..2000`), and `allocation` (`pooled`, or `equal-stars` only in `stars` mode). The remote stores the full canonical request-v2 policy (`format=shopee-review-policy-v1`, `textRule=comment-or-attributes-v1`, `order=native-filter-ascending-stars-v1`) internally. The bridge rejects a request containing both `collectionPolicy` and the legacy `reviewCapPerLink`, and still accepts the old cap-only shape (`1..300`) for compatibility.

- Required product fields for an inline product: display name (at most 120 characters), primary keyword (at most 200, no comma), category. Optional second keyword (at most 200, no comma). Commas are rejected because query chips split at commas.
- The preset ID is derived from the display name as a lowercase ASCII slug (at most 64 characters) and is not shown in the form. If the slug already exists, the page asks for a different display name or a suffix.
- Supported category scope is only the verified **Sức Khoẻ** category (`c2035652732`) with its four child groups. Other categories are rejected; the form does not guess or silently default a category.
- The page saves the product first, selects it, then creates the run. If product save succeeds but run creation fails, the product stays saved and selected, the page says the product was saved, and a retry creates only the run. A successfully saved product is never duplicated by retry.
- Changing any form field after a run is created invalidates that run's binding: the run button is disabled, the frozen summary stops claiming to match the draft, and a late create response is not attached to the changed draft. The run itself remains in history.
- Failures stay visible inline and map `PRODUCT_INPUT_INVALID`, `PRODUCT_CATEGORY_UNSUPPORTED`, `PRESET_ID_EXISTS`, `PRESET_NAME_EXISTS`, `PRESET_BUSY`, and `PRESET_WRITE_FAILED`. A `PRESET_WRITE_FAILED` can also mean the remote Node/tsx builder is unavailable.

The bridge validates the same request shape before sending it. Test the flow with fake bridge responses; do not point a test config at the real presets or runs folder.

## Review sampling

A request-v2 run stores its collection policy when the run is created. After verified M2, the flow binds that policy to one automatic attempt and uses it for the whole run and direct M3. The M3 panel shows the frozen policy read-only; editing is available only under **Tạo lần thu mới**, which saves an immutable extra plan and launches that exact plan by digest. It never changes `request.json`, the M2 selection, or a stored result. Viewing and saving a plan are offline; source counts, launch, stop and reconcile call the remote CLI.

- Modes: `with-comments`, `all`, and `stars` (`1..5`, sorted unique). The saved policy accepts N from 1 to 2000 per link. A repeated automatic M3 refuses with `AUTOMATIC_COLLECTION_EXISTS`; an explicit extra collection uses the saved-plan and plan-SHA route. Legacy request-v1 runs keep the old cap of 300 and are labelled **Cấu hình cũ · trần 1–300 mỗi link**, never silently rewritten.
- Order is `native-filter-ascending-stars-v1`: selected star filters are traversed sequentially ascending. Pooled spends one shared remaining N low-star-first, so it may finish before a higher selected star. Equal-stars is optional, available only in `stars` mode, and stops each star at its own equal quota without filling from another star.
- Source counts are native rating counts, including ratings without text; they are not the number of eligible written reviews. A missing or unknown count is shown as a dash, never `0`. An observed `0` on a loaded filter is a verified empty result.
- Outcomes keep requested, written actual and shortfall separate. Zero-result, partial, exhaustion, timeout, cancel and control-changed are distinct. A running checkpoint is `checkpoint`, not a terminal outcome. Only text reviews are collected; there is no media field, count or claim.
- A changed M2 digest invalidates the old plan: the panel drops it and launching it fails with `REVIEW_PLAN_CHANGED` before any worker starts.
- The read-only guard is the remote marker `${SHOPEE_FLOW_STATE}/shopee-flow/READONLY` (or `TDN_SHOPEE_FLOW_READONLY=1`). With `SHOPEE_FLOW_STATE` isolated, the marker blocks counts, launch and reconcile while offline viewing and saving of the review plan remain usable; saving a plan is not a DB import. Exact-attempt stop remains usable. Do not change a shared or production guard for a test.
- Offline coverage: `skills/tdn-shopee-flow/tests/test_sampling.py` runs the real CLI against a synthetic M2-pass run with isolated `SHOPEE_FLOW_RUNS` and `SHOPEE_FLOW_STATE`, Node 24 and the repository `tsx`. Launch without a collector configuration fails closed with `COLLECTOR_NOT_CONFIGURED`; no journal is written and no network is used.

## Run names

The run list and detail title show the primary search keyword and the first accepted launch time in Vietnam time (`Asia/Ho_Chi_Minh`), for example `viên uống kẽm: 11/11/2026 11:26am`. The opaque run ID stays visible as secondary text. A rerun or later attempt never renames the run. A completed legacy run with an unproven first launch shows `chưa rõ giờ bắt đầu`; only a run with honest no-launch evidence shows `Chưa chạy`.

## Save and export collected comments

Every M3 card shows **Lưu và xuất bình luận** after collection, independently of whether the current M2 input is readable. The panel uses stored settled results only; it never reruns Metric, Shopee, or a collector. The operator chooses one exact stored source, then uses one of the three buttons: **Lưu vào DB**, **Xuất JSON**, or **Xuất TXT**. Opening the panel or refresh does not save, import, or download anything.

- The source selector stays on the exact selected source across refreshes. If that source disappears, the panel requires a new selection instead of silently choosing another one.
- JSON and TXT availability are per format. Under the read-only guard, a new DB save and new JSON/TXT generation are blocked; only an exact export with an existing cache receipt remains downloadable. The panel shows the blocked reason or that receipt.
- Export runs offline through the bridge route `export-review-data`, then streams the exact file through bridge-private `read-review-export`. The desktop asks for a native Save As destination and sends only the sanitized suggested base name to the dialog. Raw contents and filesystem paths do not cross into the page, logs, or error text.
- The bridge accepts at most 64 MiB, verifies the declared size and SHA-256 while streaming, and only replaces the chosen destination after both checks pass. It uses a temporary file in the destination folder, so a failure or cancel leaves the existing destination and no `.part` file. Cancel is a normal result, not an error.
- Save uses `save-review-data` with exactly `{sourceSha256}`. Export uses `export-review-data` with exactly `{sourceSha256, format}`. A changed source, missing proof, or blocked format is shown with its static reason; it is never retried against a different source.

Offline bridge coverage, including fake native dialogs, cancellation, digest and size mismatch, spawn failure, bounded stderr, and no-partial-file behavior:

```bash
python3 -m unittest discover -s tools/shopee-desktop/tests -p 'test_review_data_bridge.py' -v
```

The Linux fixture suites require a POSIX host and repository checkout: their `sshCommand`, `remoteScript`, `runsRoot` and fake remote use local POSIX paths, so the same suites are not Windows-native tests. A Windows `C:\...` path correctly fails remote path validation; do not weaken that validator to run them. The fake remote in `tools/shopee-desktop/tests/test_review_data_bridge.py` is a reference only for the bridge contract and emits synthetic export bytes. For packaged Windows QA, use a real SSH connection to the isolated Fedora fixture described in the handoff, never the real runs folder, production database, or a real source. Windows packaging, the native Save dialog, and WebView2 rendering remain pending real Windows QA.

Build one windowed executable with the HTML bundled:

```powershell
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --windowed --name TDN-Shopee-Flow --add-data "index.html;." tdn_shopee_app.py
```

The executable is `dist\TDN-Shopee-Flow.exe`. It reads the same external config and loads the bundled page from PyInstaller's extraction directory. Use the Python `--check` command above for visible console diagnostics, since the windowed executable has no console. Closing the window does not stop a detached remote run.

Windows packaging and GUI rendering must be verified on Windows; the Linux checks cover the import, bridge and CLI only. Live capture/collection remains subject to the owner's separate authorization and the remote guard.

## Windows with WSL

To use the SSH client and authentication already configured inside WSL, replace `sshCommand` with this placeholder-only example:

```json
{ "sshCommand": ["wsl.exe", "--exec", "ssh", "-T", "-o", "BatchMode=yes", "<user>@<host>", "bash", "-s"] }
```

Keep the other config fields as described above. The bridge sends UTF-8 bytes with LF line endings through WSL to the remote shell.

The config file of a test must not point to the real runs folder.
