"""Reversible offline exercises for guide 3.3–3.5; no business rule changes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

os.environ['OPENWIKI_TELEMETRY_DISABLED'] = '1'
os.environ['OPEN_ONTOLOGIES_STORAGE_MODE'] = 'persistent'
os.environ['OO_SHACL'] = subprocess.check_output(['which', 'oo-shacl'], text=True).strip()
ROOT = Path('ontology')
BASE = 'f084663a53342074577774e5e6b3a25de0fcf4c8'
RUN_HEAD = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
rows = []
prefix = '@prefix ex: <urn:onto:> .\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n'
# Independent fixture author: GPT-6-astra, 2026-10-08, rule text/vocabulary only.
fixtures = {
    'guide-v1': '@prefix o: <urn:onto:> .\no:r a o:GuideRecord; o:marker "one" .',
    'guide-v2': '@prefix o: <urn:onto:> .\no:r a o:GuideRecord; o:marker "two" .',
}
def call(state, *args):
    p = subprocess.run(['open-ontologies', '--no-connect', '--data-dir', str(state), *args], capture_output=True, text=True)
    data = json.loads(p.stdout)
    if p.returncode or 'error' in data:
        raise RuntimeError('Guide command failed; inspect command without retaining scratch paths')
    data.pop('checker', None)
    return data

with tempfile.TemporaryDirectory(prefix='.guide-', dir=ROOT) as scratch:
    scratch = Path(scratch)
    shape = scratch / 'GUIDE.ttl'
    for version, marker in [('v1', 'one'), ('v2', 'two')]:
        # Written fixture-only decision; simulation never amends Ultimate/CHANGELOG.
        shape.write_text(prefix + 'ex:GuideShape a sh:NodeShape; ex:ruleId "GUIDE"; ex:status "proposed"; '
            'ex:source <https://github.com/khangpworking/tdn-growth-os/blob/f084663a53342074577774e5e6b3a25de0fcf4c8/docs/runbooks/ontology-use-cases-and-maintenance.md>; '
            f'sh:targetClass ex:GuideRecord; sh:property [ sh:path ex:marker; sh:maxCount 1; sh:hasValue "{marker}"; sh:message "Thiếu marker đúng phiên bản" ] .\n')
        for name, ttl in fixtures.items():
            dataset = scratch / (name + '.ttl')
            dataset.write_text(ttl)
            state = scratch / (version + name)
            syntax = call(state, 'validate', str(shape))
            call(state, 'load', str(dataset))
            actual = call(state, 'shacl', '--verified', str(shape))
            expected = name == 'guide-' + version
            passed = actual.get('verified') is True and actual.get('conforms') is expected and actual.get('report', {}).get('status') == 'verdict'
            rows.append(dict(dataset=name, version=version, expected=expected, actual=actual,
                pass_=passed, dataset_sha256=hashlib.sha256(ttl.encode()).hexdigest(),
                shape_sha256=hashlib.sha256(shape.read_bytes()).hexdigest(), ttl=ttl))
    # Pre-fix proof at same CLI boundary: original shapes accept selected new negatives.
    for rule, fixture in [('E12','E12-blank-file'), ('E12','E12-wrong-attribution'), ('E13','E13-missing-indicatorCode'), ('E4','E4-blank-author')]:
        original = subprocess.check_output(['git','show',f'f084663a53342074577774e5e6b3a25de0fcf4c8:ontology/shapes/{rule}.ttl'])
        shape.write_bytes(original)
        state = scratch / ('before-' + fixture)
        dataset = ROOT / 'tests/invalid' / (fixture + '.ttl')
        call(state, 'load', str(dataset))
        actual = call(state, 'shacl', '--verified', str(shape))
        rows.append(dict(dataset=fixture, version='before-fix', expected=True, actual=actual,
            pass_=actual.get('conforms') is True, dataset_sha256=hashlib.sha256(dataset.read_bytes()).hexdigest(),
            shape_sha256=hashlib.sha256(original).hexdigest()))
# All throwaway shapes, datasets and persistent states have now been deleted.
receipt = dict(date='2026-10-08', base=BASE, run_head=RUN_HEAD, pre_fix_shapes_from=BASE, commands=['OPENWIKI_TELEMETRY_DISABLED=1 python3 ontology/guide-checks.py',
    'validate <throwaway-shape>', 'load <throwaway-dataset>', 'shacl --verified <throwaway-shape>'],
    environment=dict(OPENWIKI_TELEMETRY_DISABLED='1',OPEN_ONTOLOGIES_STORAGE_MODE='persistent',OO_SHACL='installed checker'),
    flags=['--no-connect','--data-dir <unique scratch>'], independent_model='GPT-6-astra',
    cold_review='GPT-6-astra: masked input 4 enforces exactly marker two; reviewed by model, not by a domain expert',
    rows=rows, temporary_files_deleted=True, no_source_rule_or_changelog_changed=True)
(ROOT/'results/2026-10-08-guide-exercises.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
lines=['# Guide exercises 3.3, 3.4, 3.5 — 2026-10-08','',
    f'Source base/pre-fix shapes: `{BASE}`. Run head: `{RUN_HEAD}`.', '',
    'Command: `OPENWIKI_TELEMETRY_DISABLED=1 python3 ontology/guide-checks.py`.','',
    '3.3: create a throwaway proposed shape with source, rule ID, Vietnamese message,',
    'independent v1/v2 fixtures (GPT-6-astra) and masked cold review (input 4).',
    '3.4: simulate written rule change marker one → two; old valid becomes invalid,',
    'new valid becomes accepted. No Ultimate/CHANGELOG change. All scratch deleted.',
    '3.5: same offline syntax/load/verified commands and isolated persistent state.',
    'CLI input/output hashes and full verdicts are in the companion JSON.','',
    '| Dataset | Version | Expected | Actual | Result |','|---|---|---|---|---|']
for row in rows:
    lines.append(f"| {row['dataset']} | {row['version']} | {row['expected']} | {row['actual'].get('conforms')} | {'PASS' if row['pass_'] else 'FAIL'} |")
(ROOT/'results/2026-10-08-guide-exercises.md').write_text('\n'.join(lines)+'\n')
if not all(row['pass_'] for row in rows):
    raise SystemExit(1)
print(f'Guide and pre-fix controls: {len(rows)}/{len(rows)}; temporary files deleted')
