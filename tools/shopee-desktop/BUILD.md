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

## Add a product

The **Thêm sản phẩm** form on the **Lượt mới** screen saves a preset through `add-product --stdin`. Saving never creates a run and never starts a lookup or collection.

- Required: display name (at most 120 characters), primary keyword (at most 200, no comma), category.
- Optional: second keyword (at most 200, no comma). Commas are rejected because query chips split at commas.
- The preset ID is derived from the display name as a lowercase ASCII slug (at most 64 characters) and is not shown in the form. If the slug already exists, the page asks for a different display name or a suffix.
- Supported category scope is only the verified **Sức Khoẻ** category (`c2035652732`) with its four child groups. Other categories are rejected; the form does not guess or silently default a category.
- After a successful save the page reloads the preset list and selects the new product. Existing presets are unchanged.
- Failures stay visible inline and map `PRODUCT_INPUT_INVALID`, `PRODUCT_CATEGORY_UNSUPPORTED`, `PRESET_ID_EXISTS`, `PRESET_NAME_EXISTS`, `PRESET_BUSY`, and `PRESET_WRITE_FAILED`. A `PRESET_WRITE_FAILED` can also mean the remote Node/tsx builder is unavailable.

The bridge validates the same request shape before sending it. Test the flow with fake bridge responses; do not point a test config at the real presets or runs folder.

## Review sampling

The M3 panel of a run with a passed M2 saves an immutable custom plan, then launches that exact plan by digest. It never changes `request.json`, the M2 selection, or a legacy M3 result. Viewing and saving a plan are offline; source counts, launch, stop and reconcile call the remote CLI.

- Modes: `with-comments` (legacy default), `all`, and `stars` (`1..5`, sorted unique). A custom plan accepts N from 1 to 2000 per link. Runs without a custom plan keep the legacy `reviewCapPerLink` cap of 300.
- Order is `native-filter-ascending-stars-v1`: selected star filters are traversed sequentially ascending. Pooled spends one shared remaining N low-star-first, so it may finish before a higher selected star. Equal-stars is optional, available only in `stars` mode, and stops each star at its own equal quota without filling from another star.
- Source counts are native rating counts, including ratings without text; they are not the number of eligible written reviews. A missing or unknown count is shown as a dash, never `0`. An observed `0` on a loaded filter is a verified empty result.
- Outcomes keep requested, written actual and shortfall separate. Zero-result, partial, exhaustion, timeout, cancel and control-changed are distinct. A running checkpoint is `checkpoint`, not a terminal outcome. Only text reviews are collected; there is no media field, count or claim.
- A changed M2 digest invalidates the old plan: the panel drops it and launching it fails with `REVIEW_PLAN_CHANGED` before any worker starts.
- The read-only guard is the remote marker `${SHOPEE_FLOW_STATE}/shopee-flow/READONLY` (or `TDN_SHOPEE_FLOW_READONLY=1`). With `SHOPEE_FLOW_STATE` isolated, the marker blocks counts, launch and reconcile while offline view/save and exact-attempt stop remain usable. Do not change a shared or production guard for a test.
- Offline coverage: `skills/tdn-shopee-flow/tests/test_sampling.py` runs the real CLI against a synthetic M2-pass run with isolated `SHOPEE_FLOW_RUNS` and `SHOPEE_FLOW_STATE`, Node 24 and the repository `tsx`. Launch without a collector configuration fails closed with `COLLECTOR_NOT_CONFIGURED`; no journal is written and no network is used.

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
