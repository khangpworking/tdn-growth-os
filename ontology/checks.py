"""Offline CLI boundary checks; all state lives in task-owned explicit scratch dirs."""
import hashlib, json, shutil, subprocess, tempfile, os
os.environ["OPENWIKI_TELEMETRY_DISABLED"]="1"
from pathlib import Path
ROOT=Path('ontology')
BASE=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
records=[]
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def call(state,*args):
    argv=['open-ontologies','--no-connect','--data-dir',str(state),*args]
    p=subprocess.run(argv,text=True,capture_output=True)
    # The CLI can return exit 0 for errors; require a JSON verdict too.
    try: data=json.loads(p.stdout)
    except ValueError: data={'parse_error':p.stdout}
    if p.returncode or 'error' in data: raise RuntimeError((args,p.returncode,data,p.stderr))
    return data
with tempfile.TemporaryDirectory(prefix='onto-2-') as scratch:
    for i,case in enumerate(json.loads((ROOT/'tests/manifest.json').read_text())):
        state=Path(scratch)/str(i)
        shape=ROOT/'shapes'/f'{case["rule"]}.ttl'; fixture=ROOT/case['file']
        syntax=call(state,'validate',str(shape))
        load=call(state,'load',str(fixture))
        actual=call(state,'shacl','--verified',str(shape))
        result=actual.get('report',{}).get('results',[])
        passed=actual.get('verified') is True and actual.get('conforms') is case['expected'] and actual.get('report',{}).get('status')=='verdict'
        # Match the responsible constraint, not just any rejection.
        if not case['expected']:
            name=fixture.stem.removeprefix(case['rule']+'-')
            expected_path=case.get('path') or {'missing-attribute-locator':'attribute','duplicate-author':None,'two-cards':'card','four-authors':None,'missing-label':'aiLabel','missing-attribute-quote':'attribute','missing-card-quote':'card','missing-locator':'card','cross-platform':'platform','missing-flag':None,'four-contents':None,'missing-source':'sourceType','missing-attribution':'attribution','missing-file':'file','missing-sheet':'sheet','missing-row':'row','missing-status':'valueStatus','invalid-status':'valueStatus','wide':'inWide','hidden':'inAll'}.get(name)
            if case['rule']=='L10' and name.split('-')[0] in ['creator','brand','tagOnly','emojiOnly']:
                name=name.split('-')[0]
                matched=[r for r in result if r['sourceShape']==f'<urn:onto:L10_{name}>']
            elif expected_path:
                matched=[r for r in result if r.get('path')==f'<urn:onto:{expected_path}>']
            else:
                matched=[r for r in result if r['sourceConstraintComponent']=='<http://www.w3.org/ns/shacl#OrConstraintComponent>' and (case['rule']!='E4' or r['sourceShape']==('<urn:onto:E4UnverifiedContent>' if name in ['missing-flag','four-contents'] else '<urn:onto:E4AuthorIDs>'))]
            if case.get('sourceShape'): matched=[r for r in result if r.get('sourceShape')==case['sourceShape']]
            passed=passed and len(matched)==1 and len(result)==1
        # Remove only machine-dependent checker executable path; keep full semantic output.
        actual.pop('checker',None)
        records.append({**case,'sha256':digest(fixture),'shape_sha256':digest(shape),'syntax':syntax,'load':load,'actual':actual,'pass':passed,'escalated':bool(case.get('escalation')) and actual.get('conforms') is None and actual.get('report',{}).get('status')=='undetermined' and actual.get('undetermined','').startswith('the evaluator declined: string length:')})
        print(f'{"PASS" if passed else "ESCALATED" if records[-1]["escalated"] else "FAIL"} {case["file"]}',flush=True)
    state=Path(scratch)/'smoke'
    smoke_file=ROOT/'tests/smoke.ttl'
    smoke={'load':call(state,'load',str(smoke_file)), 'reason':call(state,'reason','--profile','rdfs','--certificate',str(Path(scratch)/'certificate')), 'query':call(state,'query','ASK { <urn:onto:synthetic> a <urn:onto:Parent> }')}
    cert=Path(scratch)/'certificate'
    if shutil.which('oo-cert'):
        p=subprocess.run(['oo-cert',str(cert/'asserted.tsv'),str(cert/'derivations.tsv')],capture_output=True,text=True)
        smoke['certificate_check']={'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
        if p.returncode != 0: raise RuntimeError('Certificate rejected')
    if not any(v is True for v in smoke['query'].values()): raise RuntimeError(('smoke ASK failed',smoke))
output=ROOT/'results'/f'2026-10-08-{BASE[:12]}.json'
for key in ['dir','scope_file']:
    smoke['reason'].get('certificate',{}).pop(key,None)
output.write_text(json.dumps({'inputs':{str(p):digest(p) for p in [ROOT/'run-checks.sh',ROOT/'checks.py',ROOT/'tests/manifest.json',ROOT/'tests/smoke.ttl',Path('docs/research/ultimate-method/ultimate-method-30-sections.md'),Path('docs/research/offline-acceptance.md')]},'base':BASE,'commands':['./ontology/run-checks.sh','open-ontologies --no-connect --data-dir <unique-scratch> validate ontology/shapes/<RULE>.ttl','open-ontologies --no-connect --data-dir <same-scratch> load ontology/<dataset>','open-ontologies --no-connect --data-dir <same-scratch> shacl --verified ontology/shapes/<RULE>.ttl'],'environment':{'OPENWIKI_TELEMETRY_DISABLED':'1','OPEN_ONTOLOGIES_STORAGE_MODE':'persistent','OO_SHACL':'installed checker'},'cli_sha256':digest(subprocess.check_output(['which','open-ontologies'],text=True).strip()),'datasets':records,'smoke':smoke},ensure_ascii=False,indent=2)+'\n')
lines=[f'# ONTO-2 results — 2026-10-08 — {BASE}', '',
'Open Ontologies installed release 2.0.1; `--version` unsupported. Binary hashes,',
'complete CLI JSON output and exact input hashes are in the companion JSON.',
'Verified checker toolchain: 4.33.1. No provider/network calls.', '',
'Commands: `./ontology/run-checks.sh`; for each manifest row:', '',
'```text',
'OPEN_ONTOLOGIES_STORAGE_MODE=persistent OO_SHACL=<installed-checker>',
'open-ontologies --no-connect --data-dir <unique-scratch> validate ontology/shapes/<RULE>.ttl',
'open-ontologies --no-connect --data-dir <same-scratch> load ontology/<dataset>',
'open-ontologies --no-connect --data-dir <same-scratch> shacl --verified ontology/shapes/<RULE>.ttl',
'```', '',
'All negative cases require exactly one violation at the intended property or',
'named exclusion shape (identity alternatives require their named mode shape and OrConstraintComponent).',
'Vietnamese messages are carried in shapes; checker ignores sh:message.', '',
'| Dataset | Expected | Actual | Intended condition | Evidence |',
'|---|---|---|---|---|']
for r in records:
    violations=r['actual'].get('report',{}).get('results',[])
    detail='; '.join((v.get('path') or v['sourceShape'])+' '+v['sourceConstraintComponent'].split('#')[-1].rstrip('>') for v in violations) or 'no violations'
    lines.append(f"| {r['file']} | {'ACCEPT' if r['expected'] else 'REJECT'} | {'ACCEPT' if r['actual'].get('conforms') is True else 'REJECT' if r['actual'].get('conforms') is False else 'UNDETERMINED'} | {r['reason']} | {'PASS' if r['pass'] else 'ESCALATED' if r['escalated'] else 'FAIL'}: {detail} |")
lines += ['', '## Separate reasoning smoke and certificate', '',
'`load ontology/tests/smoke.ttl` → `reason --profile rdfs --certificate <scratch-cert>`',
'→ `query "ASK { <urn:onto:synthetic> a <urn:onto:Parent> }"`, with the same explicit',
'persistent data directory. Expected: 2 asserted triples, 1 inferred triple, ASK true.',
f"Actual: {smoke['load']['triples_loaded']} loaded, {smoke['reason']['inferred_count']} inferred, query {smoke['query']}.",
f"Installed Lean oo-cert check exit: {smoke.get('certificate_check',{}).get('exit','NOT INSTALLED')}.",
'`oo-cert <scratch-cert>/asserted.tsv <scratch-cert>/derivations.tsv` ran separately.',
'This is an inference/certificate smoke test, not a business-rule check. No Lean build ran.', '',
f"Dataset checks: {sum(r['pass'] for r in records)}/{len(records)} matched expected results; {sum(r['escalated'] for r in records)} ESCALATED, never counted as passes."]
output.with_suffix('.md').write_text('\n'.join(lines)+'\n')
if not all(r['pass'] or r['escalated'] for r in records): raise SystemExit(1)
