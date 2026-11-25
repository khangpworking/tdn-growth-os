# TDN Shopee app releases

This page tells how a version becomes a Release, a deploy, a stable pin and a rollback.

## Version source

- `VERSION` holds `X.Y.Z` (Version rule in `BUILD.md`).
- The tag `app-vX.Y.Z` goes on the merge commit.
- The Fedora lane and the EXE come from that same commit.

## Flow

```
merge PR (VERSION X.Y.Z)
  -> tag app-vX.Y.Z ............ push the tag
  -> workflow builds EXE ....... draft pre-release: EXE + SHA256SUMS.txt
  -> owner PC builds installer . build_installer.py chung --app <Release EXE>, uploads it to the draft
  -> Fedora lane deploy ........ app-latest.json = X.Y.Z
  -> real run passes whole flow + owner says «pin app-vX.Y.Z»
  -> stable pin (server + PC + tag app-stable)
```

## Release

1. Push the tag `app-vX.Y.Z`.
2. The workflow `.github/workflows/shopee-app-release.yml` checks that `VERSION` equals the tag.
3. It installs `requirements.txt` only. It builds the EXE with the spec.
4. The build fails if PyInstaller reports `missing module named websocket`. It also fails if `websocket/_core` is not in the xref file.
5. The workflow makes a **draft** pre-release. The draft holds `TDN-Shopee-Flow-X.Y.Z.exe` and `SHA256SUMS.txt`. If the draft exists, the workflow replaces the files.

The repository is public. A published Release is public too. A draft is visible only to people with write access. So the workflow never publishes a Release, and nobody publishes one unless the owner says so.

The installer is not built in CI. It embeds a user access token. Build it on the owner PC from the Release EXE: `build_installer.py chung --app <exe>`. Then add it to the draft as `Cai-dat-TDN-Shopee-chung-X.Y.Z.exe` with `gh release upload app-vX.Y.Z <file>`, and add its line to `SHA256SUMS.txt` (`--clobber`). The owner approved this on 25/11. The draft stays a draft: only people with write access can download the installer.

## Deploy

- Deploy the Fedora lane from the same commit as the tag.
- Write `{"version":"X.Y.Z"}` to `~/.local/state/tdn-shopee-modules/app-latest.json`. Use the Release version.

## Stable pin

Pin only when both conditions are true:

- A real run passes the whole flow on that version.
- The owner says «pin app-vX.Y.Z».

Then do these steps:

| Where | Command |
|---|---|
| Fedora | `tools/shopee-desktop/release/shopee-stable.sh pin app-vX.Y.Z` |
| Owner PC | `pwsh -File tools/shopee-desktop/release/shopee-stable.ps1 pin -Version X.Y.Z` |
| GitHub | `gh release edit app-vX.Y.Z --draft=true --title "TDN Shopee app X.Y.Z (ổn định)"` |
| Git | `git tag -f app-stable app-vX.Y.Z^{commit}`, then `git push -f origin refs/tags/app-stable` |

The pin does not publish the Release and does not mark it Latest. The repository is public, so the Release stays a draft. The force push applies to the tag `app-stable` only. All other Releases stay draft pre-releases.

The Fedora pin refuses if the live `VERSION` is not X.Y.Z. It does not change live. The PC pin copies the installed EXE to `TDN-Shopee-Flow.stable.exe` and records its sha256 in `stable.json`. It also copies the shared installer to `Cai-dat-TDN-Shopee-chung-stable.exe`. `shopee-stable.ps1 shortcut` adds the desktop shortcut «TDN Shopee (bản ổn định)».

## Rollback

When the owner says «rollback», roll back the server and the app together, as one pair:

1. Fedora: `shopee-stable.sh rollback`. It refuses if no pin exists or if a run is active. It points `~/lanes/shopee-live` at the stable lane. It sets `app-latest.json` to the stable version. It saves the old values with the suffix `.before-rollback`.
2. Owner PC: `shopee-stable.ps1 rollback`. It stops the app, saves the current EXE, copies the stable EXE over it and starts it. It also restores the stable shared installer.

Runs made on newer versions stay in place.

## Current state

- Nothing is stable yet.
- 1.2.0 to 1.2.2 shipped without websocket.
- The last known real full pass is 1.1.0 (80bf7951).
- `app-v1.2.4` (05d086a5) is a draft made by hand from the owner-PC build, before this workflow existed.
- The first stable candidate is the first version whose real run passes the whole flow after #529.
