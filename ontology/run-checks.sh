#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
export OPEN_ONTOLOGIES_STORAGE_MODE=persistent
export OO_SHACL="$(command -v oo-shacl)"
exec python3 ontology/checks.py
