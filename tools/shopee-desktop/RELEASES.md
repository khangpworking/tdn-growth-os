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
5. The workflow makes a **draft** pre-release. The draft holds `TDN-Shopee-Flow-X.Y.Z.exe` and `SHA256SUMS.txt`. A release does not change after the workflow creates it. If a release for the tag exists (draft or not), the workflow fails: delete the draft or raise the version to rebuild.

The repository is public. A published Release is public too. A draft is visible only to people with write access. So the workflow never publishes a Release, and nobody publishes one unless the owner says so.

The installer is not built in CI. It embeds a user access token. Build it on the owner PC from the Release EXE: `build_installer.py chung --app <exe>`. Then add it to the draft with `pwsh -File tools/shopee-desktop/release/upload-installer.ps1 -Tag app-vX.Y.Z -Installer <file>`. The script refuses if the release is not a draft. It also refuses if the release EXE does not match its line in `SHA256SUMS.txt`. It uploads the installer as `Cai-dat-TDN-Shopee-chung-X.Y.Z.exe` and a new `SHA256SUMS.txt` with both files. Then it checks again that the release is a draft. The owner approved this on 25/11. The draft stays a draft: only people with write access can download the installer.

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

The Fedora pin refuses if the live `VERSION` is not X.Y.Z. It copies the old record to `app-stable.json.prev` and the old link target to `app-stable.prev-lane`. Then it writes `app-stable.json` and moves the stable link. It does not change live.

If a Fedora pin stops halfway, restore the previous pin by hand in `~/.local/state/tdn-shopee-modules`:
`cp app-stable.json.prev app-stable.json`, then `ln -sfn "$(cat app-stable.prev-lane)" ~/lanes/shopee-stable`.

The PC pin copies the installed EXE to `TDN-Shopee-Flow.stable.exe` and the shared installer to `Cai-dat-TDN-Shopee-chung-stable.exe`. It writes `stable.json` last, with the sha256 of both files. Before that, it moves the old stable set into a `stable-prev` folder next to each file; to undo a pin that stopped halfway, move those files back. `shopee-stable.ps1 shortcut` adds the desktop shortcut «TDN Shopee (bản ổn định)».

## Rollback

When the owner says «rollback», roll back the server and the app together, as one pair:

1. Fedora: `shopee-stable.sh rollback`. It refuses if no pin exists, if a run is active, or if it cannot check for runs. It also refuses if the stable link or the lane `VERSION` does not match `app-stable.json`. It points `~/lanes/shopee-live` at the stable lane. It sets `app-latest.json` to the stable version. It saves the old values with the suffix `.before-rollback`.
2. Owner PC: `shopee-stable.ps1 rollback`. It stops the app, saves the current EXE, copies the stable EXE over it and starts it. It also restores the stable shared installer. It checks both sha256 values before it changes anything.

Runs made on newer versions stay in place. Run rollback only when nobody is starting a run.

## Current state

- Nothing is stable yet.
- 1.2.0 to 1.2.2 shipped without websocket.
- The last known real full pass is 1.1.0 (80bf7951).
- `app-v1.2.4` (05d086a5) is a draft made by hand from the owner-PC build, before this workflow existed.
- The first stable candidate is the first version whose real run passes the whole flow after #529.
