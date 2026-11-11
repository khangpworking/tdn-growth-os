#!/usr/bin/env python3
"""Run and check the TDN Shopee review flow on the Linux host that runs the operator app.

Run it as the OS user that owns the app process, either on that host or over SSH:
  python3 shopee_flow.py status                         (on the host)
  ssh <user>@<host> python3 - status < shopee_flow.py   (from any machine; the file need not exist there)
Env overrides: SHOPEE_FLOW_PORT (default 8787), SHOPEE_FLOW_STATE (default ~/.local/state/tdn-growth-os).

Flow: keyword -> Metric capture -> pick 5 Shopee links -> collect Shopee reviews
      -> load DB (raw_db_autoload) -> Jev filter -> Jev labels.

Read-only:
  status                       app, code, paths, flags, work in flight, last runs
  guard-check                  says whether the read-only switch blocks writes in THIS shell
  run-status RUN_ID            one snapshot of a run
  watch RUN_ID [--max-min N]   exit 0 = DONE + DB load finished, 3 = STOPPED, 4 = timeout, 5 = DONE but no DB load
  verify RUN_ID                gates G1-G5 with reconciled counts; exit 0 only when all gates PASS
  usage RUN_ID                 provider calls and cost of a run (unknown cost stays "unknown")
Writes (each needs --confirm; --confirm is a typo guard, NOT proof of owner approval):
  start --keyword K [--description D] [--reports MARKET|MARKET,INSIGHT] [--workspace W] [--dry-run|--confirm]
        [--full-run] [--allow-recent] [--allow-untested-release]
        Each request is saved in ~/.local/state/tdn-growth-os/shopee-flow/requests/<uuid>.json with a state:
        PREPARED, NOT_SENT, SENDING, UNKNOWN, REFUSED, STARTED. UNKNOWN/SENDING block new starts until the owner
        checks the app and sets the state to RESOLVED in that file.
  test-mode on --cap N --confirm      restart the app with review cap N (1..20), MARKET-only runs
  test-mode off --confirm             restart the app with its original launcher
  recover --confirm                   start the original launcher when no app listens (uses the saved recovery file)

Read-only switch: env TDN_SHOPEE_FLOW_READONLY=1 or the file ~/.local/state/tdn-growth-os/shopee-flow/READONLY
refuses and logs every write. Use the FILE for evals: some agent shells (codex) do not pass pane env vars.
Never prints tokens, keys or review text.
"""
import argparse, datetime as dt, json, os, pathlib, re, sqlite3, subprocess, sys, time, urllib.error, urllib.request, uuid

PORT = int(os.environ.get('SHOPEE_FLOW_PORT', '8787'))
ORIGIN = f'http://127.0.0.1:{PORT}'
HOME = pathlib.Path.home()
STATE = pathlib.Path(os.environ.get('SHOPEE_FLOW_STATE', str(HOME / '.local/state/tdn-growth-os'))).expanduser()
TOOL = STATE / 'shopee-flow'
MODULE_DATA = HOME / '.local/state/tdn-shopee-modules'
RECOVERY = TOOL / 'recovery.json'
CAP_ENV = 'TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT'
TEST_ENV = 'TDN_RESEARCH_AUTORUN_TEST_REVIEWS'
REQUIRED_FLAGS = {'TDN_RAW_DB_AUTOLOAD_ENABLED': 'true', 'TDN_RAW_DB_REVIEW_FILTER_ENABLED': 'true',
                  'TDN_RESEARCH_JEV_ENABLED': 'true', 'TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED': '1'}
SHOW_FLAGS = (CAP_ENV, TEST_ENV, *REQUIRED_FLAGS, 'TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL', 'TDN_METRIC_OPENCLI_ENABLED')
TESTED_RELEASES = ('4681ca05',)   # releases this script was checked against
TESTED_MIGRATIONS = (73,)
SAFE_ENV_DIFF = {'OLDPWD', 'PWD', 'SHLVL', '_'}
REPORTS = {'MARKET', 'INSIGHT'}
NEED_PORTS = {8877: 'Shopee review service', 19825: 'OpenCLI bridge (Metric)'}


# ---------------------------------------------------------------- helpers
def die(msg, code=2):
    print('ERROR:', clean(msg)); sys.exit(code)


def clean(v, n=200):
    """Short, secret-free text for printing."""
    s = str(v)
    s = re.sub(r'(?i)bearer\s+\S+', 'Bearer (hidden)', s)
    s = re.sub(r'(?i)((?:token|key|secret|password|salt)["\']?\s*[:=]\s*["\']?)[^"\'\s,}]+', r'\1(hidden)', s)
    s = re.sub(r'[A-Za-z0-9_\-]{40,}', lambda m: m.group(0) if re.fullmatch(r'[0-9a-f]{64}', m.group(0)) else '(long value hidden)', s)
    return s if len(s) <= n else s[:n] + '…'


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60).stdout


READONLY_FILE = TOOL / 'READONLY'   # file flag: reaches every agent, unlike env vars (codex shells drop pane env)


def guard_write(what):
    if os.environ.get('TDN_SHOPEE_FLOW_READONLY') == '1' or READONLY_FILE.exists():
        TOOL.mkdir(mode=0o700, parents=True, exist_ok=True)
        with open(TOOL / 'readonly-attempts.log', 'a') as f: f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {what} argv={sys.argv[1:]}\n")
        die(f'read-only mode (env TDN_SHOPEE_FLOW_READONLY=1 or file {READONLY_FILE}): {what} refused. Report this; do not work around it')


def write_new(path, text, mode=0o600):
    """Create a new file; never overwrite."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, 'w') as f: f.write(text)


def proc_env(pid):
    raw = open(f'/proc/{pid}/environ', 'rb').read().decode('utf8', 'replace')
    return dict(x.split('=', 1) for x in raw.split('\0') if '=' in x)


def listening():
    found = {}
    for line in sh('ss -ltnp').splitlines():
        m = re.search(r'127\.0\.0\.1:(\d+)\s', line)
        if m:
            p = re.search(r'pid=(\d+)', line)
            found[int(m.group(1))] = int(p.group(1)) if p else -1   # -1 = listening, owner not visible
    return found


def enum(v):
    """Print only enum-like values (codes, states); anything else is hidden."""
    if v is None: return None
    s = str(v)
    return s if re.fullmatch(r'[A-Z][A-Z0-9_]{0,48}', s) else '(text hidden)'


def is_count(v): return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def check_host(pid=None):
    """Linux with /proc and ss; the caller must be the OS user that owns the app (no user name is hard-coded)."""
    if not sys.platform.startswith('linux') or not os.path.isdir('/proc'):
        die('this script runs on the Linux app host. From another machine use: ssh <user>@<host> python3 - <subcommand> < shopee_flow.py')
    for tool in ('ss',):
        if not sh(f'command -v {tool}').strip(): die(f'missing tool: {tool}')
    if pid:
        owner = os.stat(f'/proc/{pid}').st_uid
        if owner != os.getuid(): die(f'the app (pid {pid}) belongs to uid {owner}; run this as that user (you are uid {os.getuid()})')
    elif not STATE.is_dir() or STATE.stat().st_uid != os.getuid():
        die(f'state folder {STATE} is missing or not yours: run as the app user, or set SHOPEE_FLOW_STATE')


def app(required=True):
    """Find the running app from its port; never from hard-coded deploy paths."""
    pid = listening().get(PORT)
    if not pid:
        check_host()
        if required: die(f'no app listening on 127.0.0.1:{PORT}. If a test-mode restart failed, run: recover --confirm')
        return None
    if pid < 0: die(f'port {PORT} listens but its process is not visible to this user: run as the app user')
    check_host(pid)
    cwd = os.readlink(f'/proc/{pid}/cwd'); env = proc_env(pid)
    db = env.get('TDN_WORKSPACE_DB') or die('app env has no TDN_WORKSPACE_DB')
    sha8 = cwd.rsplit('operator-checkout-', 1)[-1][:8]
    deploys = []
    for p in STATE.glob('*/deployment.json'):
        try:
            d = json.loads(p.read_text())
            if str(d.get('release', '')).startswith(sha8): deploys.append((p.stat().st_mtime, d))
        except Exception: pass
    dep = sorted(deploys, key=lambda x: x[0], reverse=True)[0][1] if deploys else {}
    launcher = pathlib.Path(dep['launcher']) if dep.get('launcher') else None
    orig_env = None
    if launcher and launcher.exists():
        m = re.search(r"Path\('([^']+environment\.json)'\)", launcher.read_text())
        orig_env = pathlib.Path(m.group(1)) if m else None
    return {'pid': pid, 'cwd': cwd, 'sha8': sha8, 'release': dep.get('release'), 'migrations': dep.get('schemaMigrations'),
            'env': env, 'db': db, 'opdir': pathlib.Path(db).parent, 'artifacts': env.get('TDN_ARTIFACT_ROOT'),
            'launcher': launcher, 'orig_env_path': orig_env}


def env_diff(a, b):
    return sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k) and k not in SAFE_ENV_DIFF)


def ro(db):
    c = sqlite3.connect('file:' + db + '?mode=ro', uri=True, timeout=10); c.row_factory = sqlite3.Row
    return c


def in_flight(c):
    """Autoruns, runs and DB loads not finished. Not atomic: the app has no maintenance lock (known limit)."""
    return {
        'autorun': c.execute("select count(*) from research_automation_autorun where phase not in ('DONE','STOPPED')").fetchone()[0],
        'runs': c.execute("select count(*) from analysis_research_automation_runs where status not in ('AWAITING_SCOPE','CANCELLED','DRAFT_READY','FAILED')").fetchone()[0],
        'db_loads': c.execute('select count(*) from raw_db_autoload where finished_at is null').fetchone()[0]}


def idle(c): return all(v == 0 for v in in_flight(c).values())


def art(root, sha):
    """Content-addressed artifact: <root>/sha256/<2>/<sha>. Exact path only."""
    if not sha or not re.fullmatch(r'[0-9a-f]{64}', sha): return None
    p = pathlib.Path(root) / 'sha256' / sha[:2] / sha
    return json.loads(p.read_bytes()) if p.is_file() else None


def js(v):
    try: return json.loads(v) if v else None
    except Exception: return None


def full_run_id(c, rid):
    if not re.fullmatch(r'[0-9a-f-]{6,36}', rid): die('run id must be hex (at least 6 chars)')
    r = c.execute('select run_id from analysis_research_automation_runs where run_id like ?', (rid + '%',)).fetchall()
    if len(r) != 1: die(f'run id {rid} matches {len(r)} runs')
    return r[0][0]


def ready():
    try: return urllib.request.urlopen(ORIGIN + '/', timeout=3).status == 200
    except Exception: return False


# ---------------------------------------------------------------- read-only commands
def cmd_guard_check(_):
    env_on = os.environ.get('TDN_SHOPEE_FLOW_READONLY') == '1'
    print('read-only env:', 'on' if env_on else 'off', '| read-only file:', 'present' if READONLY_FILE.exists() else 'absent', f'({READONLY_FILE})')
    print('WRITES BLOCKED' if env_on or READONLY_FILE.exists() else 'WRITES ALLOWED')


def cmd_status(_):
    a = app(); c = ro(a['db'])
    print('app pid', a['pid'], '| code', a['release'] or a['sha8'], '| migrations', a['migrations'],
          '| tested release' if a['sha8'] in TESTED_RELEASES else '| UNTESTED release for this script')
    print('checkout ', a['cwd']); print('app dir  ', a['opdir']); print('database ', a['db']); print('artifacts', a['artifacts'])
    print('launcher ', a['launcher']); print('orig env ', a['orig_env_path'])
    for k in SHOW_FLAGS:
        v = a['env'].get(k, '(unset)')
        if k.endswith('_URL'): v = re.sub(r'//[^/@]*@', '//(hidden)@', v).split('?')[0]   # no userinfo, no query
        print('  ', k, '=', v)
    print('mode', 'TEST' if a['env'].get(TEST_ENV) == '1' else 'NORMAL')
    if a['orig_env_path'] and a['orig_env_path'].exists():
        print('running env vs original file differ in', env_diff(json.loads(a['orig_env_path'].read_text()), a['env']) or 'nothing')
    ports = listening()
    for p, name in NEED_PORTS.items(): print(f'  port {p} ({name}):', 'listening' if p in ports else 'NOT LISTENING')
    print('in flight', in_flight(c))
    if RECOVERY.exists(): print('recovery file', RECOVERY, '(left by a test-mode restart)')
    print('last 5 runs (id, keyword, reports, run status, autorun phase, stop code, created):')
    for r in c.execute("""select substr(r.run_id,1,8), r.keyword, r.reports, r.status, a.phase, a.stop_code, r.created_at
                          from analysis_research_automation_runs r left join research_automation_autorun a on a.run_id=r.run_id
                          order by r.created_at desc limit 5"""):
        print('  ', tuple(r))


def snapshot(c, rid):
    run = c.execute('select status from analysis_research_automation_runs where run_id=?', (rid,)).fetchone()
    au = c.execute('select phase,phase_state,stop_code from research_automation_autorun where run_id=?', (rid,)).fetchone()
    steps = c.execute('select step_id,state from analysis_research_automation_steps where run_id=? order by rowid', (rid,)).fetchall()
    al = c.execute('select finished_at, filtering, labelling from raw_db_autoload where run_id=? order by started_at desc', (rid,)).fetchone()
    load = None
    if al: load = ('finished' if al['finished_at'] else 'running', enum((js(al['filtering']) or {}).get('status')), enum((js(al['labelling']) or {}).get('status')))
    return (enum(run[0]) if run else None, tuple(enum(x) for x in au) if au else None, tuple(f'{enum(s[0])}={enum(s[1])}' for s in steps), load)


def cmd_run_status(ns):
    a = app(); c = ro(a['db']); rid = full_run_id(c, ns.run_id); s = snapshot(c, rid)
    print('run', rid); print('  run status', s[0]); print('  autorun (phase, state, stop_code)', s[1])
    print('  steps', s[2]); print('  DB load (state, filter, labels)', s[3])


def cmd_watch(ns):
    a = app(); rid = full_run_id(ro(a['db']), ns.run_id)
    t0 = time.time(); last = None; done_at = None
    while time.time() - t0 < ns.max_min * 60:
        try:
            c = ro(a['db']); s = snapshot(c, rid); c.close()
        except Exception as ex: s = ('ERR', type(ex).__name__, (), None)
        if s != last: print(time.strftime('%H:%M:%S'), s, flush=True); last = s
        phase = s[1][0] if s[1] else None
        if phase == 'STOPPED': print('END: autorun STOPPED, stop_code', s[1][2]); sys.exit(3)
        if phase == 'DONE':
            if s[3] and s[3][0] == 'finished': print('END: DONE and DB load finished. Next: verify', rid[:8]); sys.exit(0)
            done_at = done_at or time.time()
            if not s[3] and time.time() - done_at > 15 * 60: print('END: DONE but no DB load row after 15 min'); sys.exit(5)
        time.sleep(45)
    print('END: watch timeout', ns.max_min, 'min'); sys.exit(4)


def cmd_usage(ns):
    a = app(); c = ro(a['db']); rid = full_run_id(c, ns.run_id)
    print('provider, operation, calls, cost')
    for r in c.execute('select provider,operation,sum(request_count) n,cost_state,cost_unit,sum(cost_amount) amt from analysis_research_automation_usage where run_id=? group by 1,2,4,5', (rid,)):
        cost = f"{r['amt']} {r['cost_unit']}" if r['cost_state'] == 'KNOWN' else 'unknown'
        print('  ', r['provider'], r['operation'], r['n'], cost)
    print('Jev filter/label calls and the Market AI writer are not in this table: their cost is unknown.')


def cmd_verify(ns):
    a = app(); c = ro(a['db']); rid = full_run_id(c, ns.run_id); root = a['artifacts']
    gates, info, gaps = [], [], []
    def gate(name, ok, detail): gates.append((name, 'PASS' if ok else 'FAIL', detail))
    run = c.execute('select status,keyword,reports,period_start,period_end,created_at from analysis_research_automation_runs where run_id=?', (rid,)).fetchone()
    au = c.execute('select phase,stop_code,pick_artifact_id from research_automation_autorun where run_id=?', (rid,)).fetchone()
    print('run', rid, dict(run) if run else None)
    gate('G1 autorun ended DONE', bool(au) and au['phase'] == 'DONE', f"phase={enum(au['phase']) if au else None} stop_code={enum(au['stop_code']) if au else None}")
    # G2: reviews really collected (DONE alone is not proof: run 3d84fb29 ended DONE with 0 reviews)
    st = c.execute("select state,result_sha256 from analysis_research_automation_steps where run_id=? and step_id='COLLECTION'", (rid,)).fetchone()
    coll = art(root, st['result_sha256']) if st else None
    o = (coll or {}).get('exactShopeeOutcome') or {}
    per_link = [x.get('reviews') or 0 for x in o.get('listings') or []]
    s05_rows = c.execute("select count(*) from run_review rr join review r on r.review_key=rr.review_key where rr.run_id=? and r.source_code='S05'", (rid,)).fetchone()[0]
    gate('G2 Shopee reviews collected', o.get('outcome') == 'OK' and sum(per_link) > 0,
         f"outcome={enum(o.get('outcome'))} links={len(per_link)} reviews per link={per_link} total={sum(per_link)} testReviewCap={o.get('testReviewCap')}")
    if st and st['state'] == 'PARTIAL':
        gaps.append('COLLECTION step is PARTIAL (some other source failed or was skipped) and the run still ended DONE.')
    # G3: DB load reconciled
    al = c.execute('select * from raw_db_autoload where run_id=? order by started_at desc', (rid,)).fetchone()
    s05 = js(al['s05']) if al else {}; r5 = (s05 or {}).get('result') or {}
    ok3 = (bool(al) and bool(al['finished_at']) and (s05 or {}).get('status') == 'LOADED' and is_count(r5.get('runReviewsInserted'))
           and r5.get('runReviewsInserted') == s05_rows == sum(per_link) and s05_rows > 0)
    gate('G3 DB load S05 reconciled', ok3,
         f"load={'finished' if al and al['finished_at'] else 'missing/running'} s05={enum((s05 or {}).get('status'))} collected={sum(per_link)} "
         f"runReviewsInserted={r5.get('runReviewsInserted')} run_review S05 rows={s05_rows} (new {r5.get('reviewsInserted')}, already in DB {r5.get('reviewsAlreadyPresent')}, bad stars {r5.get('ratingInvalid')})"
         + (f" error_code={enum(str((s05 or {}).get('error')).split(':')[0])}" if (s05 or {}).get('error') else ''))
    if al: info.append('other sources in the same load: ' + str({k: enum((js(al[k]) or {}).get('status')) for k in ('s06', 's07', 's02b', 's14', 's19b', 's29')}))
    s05_keys = "select rr.review_key from run_review rr join review r on r.review_key=rr.review_key where rr.run_id=? and r.source_code='S05'"
    # G4: every S05 review of the run has a filter row under the run's policy; metadata must be present
    fl = (js(al['filtering']) if al else None) or {}; rf = fl.get('result') or {}
    pol = rf.get('policyVersion')
    meta4 = isinstance(pol, str) and bool(pol) and all(is_count(rf.get(k)) for k in ('eligible', 'called', 'inserted', 'notAssessed')) and rf.get('failed') in (None, 0, [], {})
    miss4 = c.execute(f"""select count(*) from ({s05_keys}) k where not exists
                          (select 1 from review_filter_assessment a where a.review_key=k.review_key and a.policy_version=?)""", (rid, pol)).fetchone()[0] if meta4 else None
    gate('G4 Jev filter covers S05', fl.get('status') == 'FILTERED' and meta4 and rf.get('notAssessed') == 0 and miss4 == 0,
         f"status={enum(fl.get('status'))} policy={pol} S05 reviews without a filter row={miss4 if meta4 else 'unknown (result metadata missing)'} of {s05_rows} "
         f"outcomes={rf.get('outcomes')} called={rf.get('called')} notAssessed={rf.get('notAssessed')} failed={rf.get('failed')}")
    # G5: every S05 review that needs a label (filter outcome not NO_CONTENT) has a label of the run's codebook; old labels count
    lb = (js(al['labelling']) if al else None) or {}; rl = lb.get('result') or {}
    book = rl.get('codebookVersion')
    meta5 = isinstance(book, str) and bool(book) and all(is_count(rl.get(k)) for k in ('planned', 'labelled', 'rowsInserted')) and rl.get('failed') in (None, 0, [], {})
    miss5 = c.execute(f"""select count(*) from ({s05_keys}) k
                          where not exists (select 1 from review_filter_assessment a where a.review_key=k.review_key and a.policy_version=? and a.outcome='NO_CONTENT')
                          and not exists (select 1 from review_code c2 where c2.review_key=k.review_key and c2.codebook_version=?)""", (rid, pol, book)).fetchone()[0] if (meta4 and meta5) else None
    gate('G5 Jev labels cover S05', lb.get('status') == 'LABELLED' and meta5 and meta4 and rl.get('labelled') == rl.get('planned') and miss5 == 0,
         f"status={enum(lb.get('status'))} codebook={book} labelled now={rl.get('labelled')}/{rl.get('planned')} (rows {rl.get('rowsInserted')}) "
         f"S05 reviews with content but no label of this codebook={miss5 if miss5 is not None else 'unknown (metadata missing)'} of {s05_rows}")
    # known gaps measured on this run
    if pol and book:
        bad = c.execute("""select count(distinct a.review_key) from run_review rr join review r on r.review_key=rr.review_key and r.source_code='S05'
                           join review_filter_assessment a on a.review_key=rr.review_key and a.policy_version=? and a.outcome not in ('KEEP','NO_CONTENT')
                           where rr.run_id=? and exists(select 1 from review_code k where k.review_key=a.review_key and k.codebook_version=? and k.theme_code<>'NO_THEME')""",
                        (pol, rid, book)).fetchone()[0]
        gaps.append(f'The filter runs in shadow: the labeller does not read it. S05 reviews of this run the filter did not KEEP (policy {pol}) that carry a theme label (codebook {book}): {bad}.')
    pick = art(root, au['pick_artifact_id']) if au else None
    if pick: info.append(f"pick counts {pick.get('counts')} | links picked {len(pick.get('urls') or [])}")
    gaps.append('Masked Shopee ids (phone-number form) are dropped by the pick step with no count or warning; pick counts do not include them.')
    pols = [r[0] for r in c.execute('select distinct policy_version from review_filter_assessment')]
    info.append(f'filter policy versions present in the DB: {pols} (information, not an error)')
    for i in info: print(i)
    print('\nGATES')
    for g in gates: print(f'  {g[1]}  {g[0]}: {clean(g[2], 400)}')
    print('KNOWN GAPS (not gates)')
    for g in gaps: print('  -', g)
    ok = all(g[1] == 'PASS' for g in gates)
    print('\nRESULT', 'PASS: the steps ran and the counts match (collect -> DB -> filter -> labels). The filter still does not control labels.'
          if ok else 'FAIL: see the first FAIL gate')
    sys.exit(0 if ok else 1)


# ---------------------------------------------------------------- start
def post(path, body, tok=None):
    h = {'Origin': ORIGIN, 'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    q = urllib.request.Request(ORIGIN + path, data=json.dumps(body).encode(), headers=h, method='POST')
    try:
        r = urllib.request.urlopen(q, timeout=120); return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as ex:
        try: return ex.code, json.loads(ex.read() or b'{}')
        except Exception: return ex.code, {}


def save_request(path, data):
    tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(data, ensure_ascii=False)); os.replace(tmp, path)


def cmd_start(ns):
    a = app(); c = ro(a['db']); problems = []
    reports = [x.strip().upper() for x in ns.reports.split(',') if x.strip()]
    if reports not in (['MARKET'], ['MARKET', 'INSIGHT']): problems.append(f'reports must be exactly MARKET or MARKET,INSIGHT (got {ns.reports})')
    test = a['env'].get(TEST_ENV) == '1'
    cap = a['env'].get(CAP_ENV, '300')
    if a['orig_env_path'] and a['orig_env_path'].exists():
        orig = json.loads(a['orig_env_path'].read_text())
        expect = dict(orig, **({CAP_ENV: cap, TEST_ENV: '1'} if test else {}))
        d = env_diff(expect, a['env'])
        if d: problems.append(f'running env differs from the expected config in {d}')
    else: problems.append('cannot read the original environment file from deployment.json')
    unknown = []
    for p in (TOOL / 'requests').glob('*.json') if (TOOL / 'requests').exists() else []:
        try:
            r = json.loads(p.read_text())
            if r.get('state') in ('SENDING', 'UNKNOWN'): unknown.append(p.name)
        except Exception: unknown.append(p.name)
    if unknown: problems.append(f'earlier start request(s) with unknown outcome: {unknown}. Ask the owner to check the app; then mark them by hand. Do not resend')
    if test and reports != ['MARKET']: problems.append('TEST mode works only with reports=MARKET (the small cap is ignored for other reports)')
    if test and not (cap.isdigit() and 1 <= int(cap) <= 20): problems.append(f'TEST mode but cap is {cap}, not 1..20')
    if not test and not ns.full_run: problems.append(f'app is in NORMAL mode (cap {cap} reviews per link). Add --full-run only if the owner approved a full run')
    if a['sha8'] not in TESTED_RELEASES and not ns.allow_untested_release: problems.append(f"release {a['sha8']} is not tested with this script (add --allow-untested-release after reading the code map)")
    if a['migrations'] not in TESTED_MIGRATIONS and not ns.allow_untested_release: problems.append(f"schema migrations {a['migrations']} not tested")
    for k, v in REQUIRED_FLAGS.items():
        if a['env'].get(k) != v: problems.append(f'{k}={a["env"].get(k)} (need {v})')
    ports = listening()
    for p, name in NEED_PORTS.items():
        if p not in ports: problems.append(f'port {p} ({name}) is not listening')
    if not idle(c): problems.append(f'work in flight {in_flight(c)}')
    wss = [r[0] for r in c.execute('select distinct workspace_id from research_automation_autorun')]
    ws = ns.workspace or (wss[0] if len(wss) == 1 else None)
    if not ws: problems.append(f'{len(wss)} workspaces found; pass --workspace')
    recent = c.execute("select substr(run_id,1,8), status, created_at from analysis_research_automation_runs where keyword=? and created_at > ?",
                       (ns.keyword, (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=30)).strftime('%Y-%m-%dT%H:%M:%S'))).fetchall()
    if recent and not ns.allow_recent: problems.append(f'a run for this keyword started in the last 30 min: {[tuple(r) for r in recent]}. Check it before starting another (or --allow-recent)')
    end = dt.date.today() - dt.timedelta(days=1); start = end - dt.timedelta(days=364)
    key = str(uuid.uuid4())
    body = {'contractVersion': 'research-automation-start-v2', 'waitForKeyword2': False, 'requestKey': key, 'mode': 'CATEGORY',
            'keyword': ns.keyword, 'requestedPeriod': {'startDate': start.isoformat(), 'endDate': end.isoformat()}, 'reports': reports}
    if ns.description: body['description'] = ns.description
    print('mode', 'TEST' if test else 'NORMAL', '| cap', cap, '| release', a['sha8'], '| workspace', ws)
    print('request', json.dumps(body, ensure_ascii=False))
    if problems:
        print('PREFLIGHT FAILED:'); [print('  -', p) for p in problems]; sys.exit(2)
    print('PREFLIGHT OK')
    if ns.dry_run or not ns.confirm:
        print('DRY RUN: nothing sent.' + ('' if ns.dry_run else ' Add --confirm to start a real run (owner approval needed).')); return
    guard_write('start --confirm')
    TOOL.mkdir(mode=0o700, parents=True, exist_ok=True); (TOOL / 'requests').mkdir(mode=0o700, exist_ok=True)
    req = TOOL / 'requests' / f'{key}.json'          # key is a fresh uuid4: safe file name
    rec = {'state': 'PREPARED', 'preparedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'workspace': ws, 'body': body}
    write_new(req, json.dumps(rec, ensure_ascii=False))
    s, b = post('/owner-api/local-test-session', {})
    if s != 200 or 'token' not in b:
        save_request(req, dict(rec, state='NOT_SENT', reason=f'local-test-session HTTP {s}')); die(f'local-test-session failed: HTTP {s}. Nothing was started')
    save_request(req, dict(rec, state='SENDING'))
    try:
        s, b = post(f'/owner-api/workspaces/{ws}/research-automation/runs', body, b['token'])
    except Exception as ex:
        save_request(req, dict(rec, state='UNKNOWN', reason=type(ex).__name__))
        die(f'no answer from the app ({type(ex).__name__}). The run MAY exist. Do not resend. Report to the owner with request file {req}. '
            f'Check status / the app form for keyword {ns.keyword!r}.')
    run = b.get('run') if isinstance(b, dict) else None
    rid = (run or {}).get('runId')
    code = enum((b or {}).get('code')) if isinstance(b, dict) else None
    if 400 <= s < 500 and code and code != '(text hidden)':
        # a 4xx with an error code is the app's validation answer: no run was created
        save_request(req, dict(rec, state='REFUSED', http=s, code=code))
        die(f'start refused: HTTP {s} code={code}. No run was created')
    if s >= 400:
        # 5xx or an answer without an error code: the run MAY exist
        save_request(req, dict(rec, state='UNKNOWN', http=s, code=code))
        die(f'HTTP {s} code={code}: the run MAY exist. Do not resend; report to the owner with request file {req}')
    if not rid or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', str(rid)):
        save_request(req, dict(rec, state='UNKNOWN', http=s, reason='answer has no valid runId'))
        die(f'HTTP {s} but the answer has no valid runId. The run MAY exist. Do not resend; report to the owner.')
    save_request(req, dict(rec, state='STARTED', http=s, runId=rid))
    au = run.get('autoRun') or {}
    print('HTTP', s, 'runId', rid, 'status', enum(run.get('status')), 'autoRun phase', enum(au.get('phase')), 'requestedPeriod', run.get('requestedPeriod'))
    print('request saved', req); print('Next: watch', rid[:8])


# ---------------------------------------------------------------- restart / recovery
def stop_and_start(a, launcher, expect_env):
    """Stop the app, start `launcher`, check readiness and the full env. Saves a recovery file first."""
    c = ro(a['db'])
    if not idle(c): die(f'work in flight {in_flight(c)}; do not restart')
    c.close()
    TOOL.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = RECOVERY.with_suffix('.tmp')
    tmp.write_text(json.dumps({'savedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'release': a['release'], 'db': a['db'],
                               'originalLauncher': str(a['launcher']), 'originalEnv': str(a['orig_env_path']),
                               'startingLauncher': str(launcher), 'oldPid': a['pid']}))
    os.replace(tmp, RECOVERY)
    lock = pathlib.Path(a['db'] + '.executor.lock')
    os.kill(a['pid'], 15)
    for _ in range(90):
        if not os.path.exists(f"/proc/{a['pid']}"): break
        time.sleep(1)
    if os.path.exists(f"/proc/{a['pid']}") or lock.exists(): die('old app did not stop cleanly (process or executor lock left). Do not start a second app. Ask the owner.')
    launch_and_check(launcher, expect_env, a['sha8'])


def app_processes():
    """Live operator app processes (any port), from /proc."""
    out = []
    for p in pathlib.Path('/proc').iterdir():
        if p.name.isdigit():
            try:
                if b'serve-operator-app.ts' in (p / 'cmdline').read_bytes(): out.append(int(p.name))
            except Exception: pass
    return out


def group_alive(pgid):
    """Any live process in process group `pgid` (launcher, its python, the node app it execs)."""
    if not pgid: return []
    out = []
    for p in pathlib.Path('/proc').iterdir():
        if p.name.isdigit():
            try:
                stat = (p / 'stat').read_text(); fields = stat[stat.rindex(')') + 2:].split()
                if int(fields[2]) == pgid: out.append(int(p.name))
            except Exception: pass
    return out


def launch_and_check(launcher, expect_env, sha8):
    # one new session: the launcher pid is also the process-group id of everything it starts
    proc = subprocess.Popen(['bash', str(launcher)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    if RECOVERY.exists():
        r = json.loads(RECOVERY.read_text()); r['launchedPgid'] = proc.pid; tmp = RECOVERY.with_suffix('.tmp'); tmp.write_text(json.dumps(r)); os.replace(tmp, RECOVERY)
    for _ in range(120):
        time.sleep(1)
        if ready(): break
    if not ready():
        die(f'app not ready after 120 s (GET / is not 200). Live app processes: {app_processes()}. Read operator.log and ask the owner. '
            'Use recover --confirm only when no app process is alive.')
    b = app()
    diff = env_diff(expect_env, b['env'])
    print('app up, pid', b['pid'], 'code', b['sha8'], '| cap', b['env'].get(CAP_ENV), '| test', b['env'].get(TEST_ENV, '(unset)'))
    if b['sha8'] != sha8: die(f"code after restart {b['sha8']} != {sha8}")
    if diff: die(f'env after restart differs from the expected env in {diff}')
    print('env matches the expected file')
    if expect_env.get(TEST_ENV) != '1' and RECOVERY.exists(): RECOVERY.unlink()


def cmd_test_mode(ns):
    a = app()
    if not a['launcher'] or not a['orig_env_path'] or not a['orig_env_path'].exists(): die('cannot find the original launcher/env from deployment.json')
    orig = json.loads(a['orig_env_path'].read_text())
    if ns.state == 'on':
        if not (1 <= ns.cap <= 20): die('--cap must be 1..20 (test mode limit in providers.ts)')
        if a['sha8'] not in TESTED_RELEASES or a['migrations'] not in TESTED_MIGRATIONS:
            die(f"release {a['sha8']} / migrations {a['migrations']} not tested with this script; do not restart. Ask the owner")
        if a['env'].get(TEST_ENV) == '1': die('app is already in TEST mode; run test-mode off first')
        diff = env_diff(orig, a['env'])
        if diff: die(f'running env differs from the original file in {diff}; stop and ask the owner')
        stamp = time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
        d = STATE / f'run-test-{stamp}'
        new = a['launcher'].with_name(a['launcher'].stem + f'-test-{stamp}.sh')
        t = a['launcher'].read_text(); n = t.replace(str(a['orig_env_path']), str(d / 'environment.json'))
        if n == t or n.count(str(d)) != 1: die('could not point the launcher copy at the test env')
        print('plan: test env', d / 'environment.json', '| test launcher', new, '| cap', ns.cap, '| original files stay unchanged')
        if not ns.confirm: print('DRY RUN: nothing written, no restart. Add --confirm.'); return
        guard_write('test-mode on --confirm')
        d.mkdir(mode=0o700)
        e2 = dict(orig); e2[CAP_ENV] = str(ns.cap); e2[TEST_ENV] = '1'
        write_new(d / 'environment.json', json.dumps(e2, indent=2)); write_new(new, n, 0o700)
        stop_and_start(a, new, e2)
        print('TEST mode on. Restore after the run with: test-mode off --confirm')
    else:
        if a['env'].get(TEST_ENV) != '1':
            d = env_diff(orig, a['env'])
            if d: die(f'app is not in TEST mode, but its env differs from the original file in {d}. Ask the owner')
            print('app already in NORMAL mode and env matches the original file; nothing to do'); return
        print('plan: restart with original launcher', a['launcher'])
        if not ns.confirm: print('DRY RUN: no restart. Add --confirm.'); return
        guard_write('test-mode off --confirm')
        stop_and_start(a, a['launcher'], orig)
        print('NORMAL mode restored.')


def cmd_recover(ns):
    check_host()
    if listening().get(PORT):
        die(f'something listens on {PORT}. If GET / is not 200 the app is up but not ready: read operator.log and ask the owner. recover is only for a dead app.')
    if not RECOVERY.exists(): die(f'no recovery file {RECOVERY}; ask the owner which launcher to start')
    r = json.loads(RECOVERY.read_text())
    alive = ([p for p in (r.get('oldPid'),) if p and os.path.exists(f'/proc/{p}')]
             + group_alive(r.get('launchedPgid')) + app_processes())
    if alive: die(f'app processes are still alive {sorted(set(alive))}. Do not start another one. Ask the owner.')
    launcher, envp = pathlib.Path(r['originalLauncher']), pathlib.Path(r['originalEnv'])
    lock = pathlib.Path(r['db'] + '.executor.lock')
    print('plan: start original launcher', launcher, '| expected env', envp, '| release', r.get('release'))
    if lock.exists(): die(f'executor lock {lock} exists but no app listens. Do not delete it yourself. Ask the owner.')
    if not ns.confirm: print('DRY RUN: nothing started. Add --confirm.'); return
    guard_write('recover --confirm')
    launch_and_check(launcher, json.loads(envp.read_text()), str(r.get('release') or '')[:8])
    print('recovered to NORMAL mode')


# ---------------------------------------------------------------- offline module gates (B1)
def gate_read(path):
    """Missing/invalid evidence is a failed check, never a successful empty value."""
    try:
        return json.loads(path.read_bytes(), parse_constant=lambda value: (_ for _ in ()).throw(ValueError()))
    except (OSError, ValueError, RecursionError):
        return None


def gate_path(run, relative):
    """Do not read or write evidence through symlinks outside this run."""
    name = pathlib.PurePosixPath(relative)
    if name.is_absolute() or '..' in name.parts or any(c in str(relative) for c in ('\\', '\t', '\n', '\r')):
        raise ValueError('unsafe run-relative path')
    path = run / relative
    for part in (path, *path.parents):
        if part == run:
            break
        if part.is_symlink():
            raise ValueError('symlink in run')
    return path


def gate_hash(run, relative):
    import hashlib
    try:
        if relative in ('m1/', 'm3/'):
            folder = gate_path(run, relative)
            if not folder.is_dir():
                return None
            files = []
            for path in folder.rglob('*'):
                gate_path(run, path.relative_to(run).as_posix())
                if path.is_file():
                    files.append(path.relative_to(folder).as_posix())
                elif not path.is_dir():
                    raise ValueError('unsupported evidence file')
            lines = ''.join(f'{name}\t{hashlib.sha256(gate_path(run, relative + name).read_bytes()).hexdigest()}\n'
                            for name in sorted(files))
            return hashlib.sha256(lines.encode('utf8')).hexdigest()
        return hashlib.sha256(gate_path(run, relative).read_bytes()).hexdigest()
    except OSError:
        return None


def gate_prerequisite(run, previous, input_sha):
    """Shared B1/B2 barrier. Returns (errorCode, exitCode), or (None, 0)."""
    if previous is None:
        return None, 0
    slip = gate_read(gate_path(run, f'gates/{previous}.json'))
    if (not isinstance(slip, dict) or slip.get('format') != 'handoff-v1'
            or slip.get('runId') != run.name or slip.get('module') != previous.upper()
            or slip.get('verdict') != 'PASS'):
        return 'GATE_NOT_PASSED', 22
    if input_sha is None or slip.get('outputSha256') != input_sha:
        return 'GATE_INPUT_CHANGED', 23
    return None, 0


def gate_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        return False
    try:
        dt.date.fromisoformat(value)
        return True
    except ValueError:
        return False


def gate_schema(value, schema):
    """Validate the vocabulary used by the local rows/selection schemas, stdlib only.

    Unsupported schema assertions fail closed. The app schema remains canonical.
    """
    supported = {'$schema', '$id', 'title', 'description', 'type', 'const', 'enum', 'anyOf',
                 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems',
                 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'format', 'uniqueItems'}
    if set(schema) - supported:
        return False
    if 'anyOf' in schema and not any(gate_schema(value, part) for part in schema['anyOf']):
        return False
    types = {'null': value is None, 'boolean': type(value) is bool, 'integer': type(value) is int,
             'number': type(value) in (int, float), 'string': isinstance(value, str),
             'object': isinstance(value, dict), 'array': isinstance(value, list)}
    expected = schema.get('type')
    if expected and not any(types.get(t, False) for t in (expected if isinstance(expected, list) else [expected])):
        return False
    if 'const' in schema and (value != schema['const'] or type(value) is not type(schema['const'])):
        return False
    if 'enum' in schema and not any(value == item and type(value) is type(item) for item in schema['enum']):
        return False
    if isinstance(value, dict):
        props = schema.get('properties', {})
        if not all(k in value for k in schema.get('required', [])):
            return False
        if schema.get('additionalProperties') is False and set(value) - set(props):
            return False
        if not all(gate_schema(v, props[k]) for k, v in value.items() if k in props):
            return False
    if isinstance(value, list):
        if schema.get('uniqueItems') and any(v in value[:i] for i, v in enumerate(value)):
            return False
        if not schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', float('inf')):
            return False
        if 'items' in schema and not all(gate_schema(v, schema['items']) for v in value):
            return False
    if isinstance(value, str):
        if not schema.get('minLength', 0) <= len(value) <= schema.get('maxLength', float('inf')):
            return False
        if 'pattern' in schema and not re.search(schema['pattern'], value):
            return False
        if schema.get('format') == 'date' and not gate_date(value):
            return False
        if schema.get('format') == 'date-time':
            try:
                parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
                if parsed.tzinfo is None:
                    return False
            except ValueError:
                return False
        elif schema.get('format') not in (None, 'date'):
            return False
    if type(value) in (int, float):
        import math
        if not math.isfinite(value) or not schema.get('minimum', -float('inf')) <= value <= schema.get('maximum', float('inf')):
            return False
    return True


def gate_metric_ids(raw):
    """Structural ID membership only; no selection, filtering, revenue or ranking."""
    ids, stack = set(), [raw]
    while stack:
        node = stack.pop()
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            value = node.get('product_base_id')
            if isinstance(value, str) and value.startswith('1__'):
                ids.add(value)
            stack.extend(node.values())
    return ids


def gate_metric_windows(run):
    """Read the capture's declared windows; never choose an M2 ranking window."""
    capture = gate_path(run, 'm1')
    root_manifest = gate_path(run, 'm1/manifest.json')
    if not root_manifest.is_file() and capture.is_dir():
        candidates = []
        for child in capture.iterdir():
            if re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', child.name):
                path = gate_path(run, f'm1/{child.name}/run1/manifest.json')
                if path.is_file():
                    candidates.append(path)
        if len(candidates) != 1:
            return {}, []
        root_manifest = candidates[0]
    capture_prefix = root_manifest.parent.relative_to(run).as_posix() + '/'
    manifest = gate_read(root_manifest)
    if not isinstance(manifest, dict):
        return {}, []
    if manifest.get('contractVersion') != 'metric-v3-capture-v1':
        return manifest, []
    declared = manifest.get('windows')
    if not isinstance(declared, list) or not declared:
        return manifest, []
    windows, seen = [], set()
    for ref in declared:
        if not isinstance(ref, dict):
            return manifest, []
        identifier, path = ref.get('window'), ref.get('path')
        if (not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', identifier)
                or identifier in seen or path != f'{identifier}/manifest.json'):
            return manifest, []
        seen.add(identifier)
        part = gate_read(gate_path(run, capture_prefix + path))
        raw = gate_read(gate_path(run, f'{capture_prefix}{identifier}/raw-responses.json'))
        windows.append({'id': identifier, 'manifest': part, 'raw': raw,
                        'hashMatches': ref.get('sha256') == gate_hash(run, capture_prefix + path) and ref.get('sha256') is not None})
    return manifest, windows


def evaluate_gate(run, gate, *, readonly_file=None):
    """Offline evaluation; the optional guard path is for read-only old-run tests.

    It cannot change guard_write or authorize module/provider execution.
    """
    base = pathlib.Path(__file__).resolve().parents[1]
    config = json.loads((base / 'modules.json').read_bytes())
    modules = {m['id']: m for m in config['modules']}
    read = lambda name: gate_read(gate_path(run, name))
    selection = read('m2/selection.json') if gate in ('m2', 'm3') else None
    selection = selection if isinstance(selection, dict) else {}
    manual = gate == 'm2' and selection.get('source') == 'manual'
    inp = {'entry': None, 'm1': 'request.json', 'm2': None if manual else 'm1/', 'm3': 'm2/selection.json'}[gate]
    out = {'entry': 'request.json', 'm1': 'm1/', 'm2': 'm2/selection.json', 'm3': 'm3/'}[gate]
    previous = {'entry': None, 'm1': 'entry', 'm2': None if manual else 'm1', 'm3': 'm2'}[gate]
    input_sha = gate_hash(run, inp) if inp else None
    code, exit_code = gate_prerequisite(run, previous, input_sha)
    checks = []
    def check(identifier, ok, got, warn=False):
        item = {'id': identifier, 'ok': bool(ok), 'got': got}
        if warn:
            item['level'] = 'warn'
        checks.append(item)
    request = read('request.json') if not code else None
    request = request if isinstance(request, dict) else {}
    params = config['params']
    cap = request.get('reviewCapPerLink')
    output_sha = gate_hash(run, out)
    if not code and gate == 'entry':
        preset = request.get('preset')
        keywords = preset.get('keywords') if isinstance(preset, dict) else None
        check('product_text', request.get('format') == 'request-v1' and isinstance(keywords, list) and bool(keywords) and
              all(isinstance(k, str) and k.strip() for k in keywords), len(keywords) if isinstance(keywords, list) else 0)
        windows = request.get('windows')
        periods = [w.get('period') for w in windows if isinstance(w, dict)] if isinstance(windows, list) else []
        window_ids = [w.get('id') for w in windows if isinstance(w, dict)] if isinstance(windows, list) else []
        ids_valid = all(isinstance(i, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', i) for i in window_ids)
        valid = bool(periods) and len(periods) == len(windows) and ids_valid and len(set(window_ids)) == len(window_ids) and all(isinstance(p, dict) and
                gate_date(p.get('startDate')) and gate_date(p.get('endDate')) and p['startDate'] <= p['endDate'] for p in periods)
        check('period_dates', valid, {'windows': len(periods), 'valid': bool(valid)})
        check('review_cap_1_300', type(cap) is int and params['reviewCapPerLink']['min'] <= cap <= params['reviewCapPerLink']['max'], cap if type(cap) is int else None)
        off = os.environ.get('TDN_SHOPEE_FLOW_READONLY') != '1' and not (READONLY_FILE if readonly_file is None else pathlib.Path(readonly_file)).exists()
        check('readonly_off', off, off)
        spec = request.get('captureSpec')
        spec_windows = spec.get('windows') if isinstance(spec, dict) else None
        present = (isinstance(spec_windows, list) and len(spec_windows) == 2 and
                   all(isinstance(w, dict) for w in spec_windows) and
                   [w.get('id') for w in spec_windows] == ['30d', '12m'])
        check('capture_spec_present', present, bool(present) if 'captureSpec' in request else 'absent', 'captureSpec' not in request)
    elif not code and gate == 'm1':
        manifest, windows = gate_metric_windows(run)
        successes, readable, row_counts, periods = [], [], [], []
        requested = request.get('windows')
        requested = requested if isinstance(requested, list) else []
        wanted = {w['id']: w.get('period') for w in requested if isinstance(w, dict) and isinstance(w.get('id'), str)}
        same_windows = bool(windows) and len(wanted) == len(requested) == len(windows) and set(wanted) == {w['id'] for w in windows}
        for window in windows:
            part = window['manifest'] if isinstance(window['manifest'], dict) else {}
            capture = part.get('captureGate')
            successes.append(capture == 'PASSED' or isinstance(capture, dict) and capture.get('cleared') is True)
            readable.append(bool(part) and isinstance(window['raw'], (dict, list)) and window['hashMatches'])
            row_counts.append(len(gate_metric_ids(window['raw'])))
            applied = part.get('window') or part.get('appliedFilters') or {}
            period = applied.get('period') if isinstance(applied, dict) else None
            periods.append(isinstance(period, dict) and period == wanted.get(window['id']) and
                           (not isinstance(part.get('window'), dict) or part['window'].get('id') == window['id']))
        check('capture_success', bool(windows) and all(successes), {'windows': len(windows), 'passed': sum(successes)})
        check('files_readable', bool(windows) and all(readable), {'windows': len(windows), 'readable': sum(readable)})
        check('has_shopee_rows', bool(windows) and all(n > 0 for n in row_counts), {'perWindow': row_counts})
        check('period_matches', same_windows and all(periods), {'windowsMatch': same_windows, 'matched': sum(periods)})
        # R3: structural prefix/marker count only; no revenue calculation in Python.
        ids = set().union(*(gate_metric_ids(w['raw']) for w in windows))
        masked = sum('[REDACTED' in identifier for identifier in ids)
        check('masked_ids', masked == 0, masked, True)
        error = manifest.get('errorCode') or manifest.get('code')
        code = error if isinstance(error, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', error) else None
    elif not code and gate == 'm2':
        links = selection.get('links')
        links = links if isinstance(links, list) else []
        records = [link for link in links if isinstance(link, dict)]
        count = len(links)
        shape = (selection.get('format') == 'selection-v1' and selection.get('runId') == run.name and
                 selection.get('source') in ('auto', 'manual') and len(records) == count)
        check('links_1_to_5', shape and 1 <= count <= 5, count)
        numeric = lambda v: isinstance(v, str) and re.fullmatch(r'[1-9][0-9]{0,19}', v) is not None
        check('ids_numeric', bool(records) and len(records) == count and all(numeric(l.get('shopId')) and numeric(l.get('itemId')) and
              l.get('productBaseId') == f"1__{l.get('itemId')}__{l.get('shopId')}" for l in records), count)
        shops = [l.get('shopId') for l in records]
        check('no_duplicate_shop', bool(records) and all(isinstance(s, str) for s in shops) and len(set(s for s in shops if isinstance(s, str))) == count, count - len(set(s for s in shops if isinstance(s, str))))
        counts = selection.get('counts')
        masked = counts.get('maskedAboveLowestPick') if isinstance(counts, dict) else None
        if manual:
            for identifier in ('no_masked_above_lowest_pick', 'links_in_m1', 'pick_rule_version'):
                check(identifier, True, 'manual', True)
            # Manual still has a defined source identity, not an arbitrary bypass.
            checks[0]['ok'] &= selection.get('metricInputSha256') is None and selection.get('pickRuleVersion') == 'manual'
        else:
            check('no_masked_above_lowest_pick', is_count(masked) and masked == 0, masked if is_count(masked) else 'not measurable in B1')
            _, windows = gate_metric_windows(run)
            # Structural membership across the capture, not a choice of ranking window (D11).
            ids = set().union(*(gate_metric_ids(w['raw']) for w in windows))
            members = sum(isinstance(l.get('productBaseId'), str) and l['productBaseId'] in ids for l in records)
            check('links_in_m1', bool(records) and members == count and selection.get('metricInputSha256') == input_sha, {'matched': members, 'links': count, 'hashMatches': selection.get('metricInputSha256') == input_sha})
            version_ok = selection.get('pickRuleVersion') == modules['M2']['ruleVersion']
            check('pick_rule_version', version_ok, 'MATCH' if version_ok else 'MISMATCH')
        reasons = sum(isinstance(l.get('reason'), str) and bool(l['reason'].strip()) for l in records)
        check('pick_reason_present', bool(records) and reasons == count, reasons)
        error = selection.get('errorCode')
        code = error if isinstance(error, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', error) else None
    elif not code and gate == 'm3':
        data = read('m3/reviews.json')
        rows = data if isinstance(data, list) else []
        receipt = read('m3/outcome.json')
        receipt = receipt if isinstance(receipt, dict) else {}
        outcome, error = receipt.get('verdict'), receipt.get('errorCode')
        success = params['collectionSuccessVerdicts']
        valid_code = lambda value: isinstance(value, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', value) is not None
        valid_receipt = (receipt.get('format') == 'm3-outcome-v1' and valid_code(outcome) and
                         'errorCode' in receipt and (error is None or valid_code(error)))
        code = (error or (outcome if outcome not in success else None)) if valid_receipt else None
        if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', code):
            code = None
        check('verdict_ok', valid_receipt and outcome in success and error is None, outcome if valid_receipt else 'MISSING_OR_INVALID')
        links = selection.get('links')
        links = links if isinstance(links, list) else []
        pair = lambda row: (row.get('shopId'), row.get('itemId')) if isinstance(row, dict) and isinstance(row.get('shopId'), str) and isinstance(row.get('itemId'), str) else None
        expected = [pair(link) for link in links]
        actual = [pair(row) for row in rows]
        per_link = [sum(p == key for p in actual) for key in expected]
        check('min_reviews_per_link', bool(expected) and None not in expected and all(n >= params['minReviewsPerLink'] for n in per_link), per_link)
        check('cap_not_exceeded', type(cap) is int and bool(expected) and all(n <= cap for n in per_link), per_link)
        identities = [r.get('reviewId') for r in rows if isinstance(r, dict)]
        valid_ids = [i for i in identities if isinstance(i, str) and i.strip()]
        duplicates = len(valid_ids) - len(set(valid_ids))
        check('no_duplicate_review_ids', len(valid_ids) == len(rows) and duplicates == 0, {'duplicates': duplicates, 'missing': len(rows) - len(valid_ids)})
        check('product_ids_match_m2', bool(expected) and None not in expected and None not in actual and set(expected) == set(actual), {'selected': len(set(expected)), 'observed': len(set(actual))})
        rows_schema = gate_read(base.parents[1] / 'contracts/foundation/shopee-public-rows.schema.json')
        check('shape_shopee_public_rows', isinstance(rows_schema, dict) and gate_schema(data, rows_schema), len(rows))
        below_cap = sum(n < cap for n in per_link) if type(cap) is int else None
        check('links_below_cap', below_cap == 0, {'belowCap': below_cap, 'cap': cap}, warn=True)
    if code in params['handToOwnerCodes']:
        verdict, exit_code = 'WAIT_OWNER', 21
    elif code or any(not c['ok'] and c.get('level') != 'warn' for c in checks):
        verdict, exit_code = 'FAIL', exit_code or 20
    else:
        verdict, exit_code = 'PASS', 0
    module = gate.upper()
    version = config['flow']['skillVersion'] if gate == 'entry' else modules[module]['skillVersion']
    slip = {'format': 'handoff-v1', 'module': module, 'runId': run.name, 'skillVersion': version,
            'verdict': verdict, 'inputSha256': input_sha, 'outputSha256': output_sha, 'checks': checks,
            'errorCode': code, 'next': {'entry': 'M1', 'm1': 'M2', 'm2': 'M3', 'm3': None}[gate] if verdict == 'PASS' else None}
    return slip, exit_code


def cmd_gate(ns):
    root = pathlib.Path(os.environ.get('SHOPEE_FLOW_RUNS', str(MODULE_DATA / 'runs'))).expanduser().resolve()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', ns.run_id):
        die('invalid run ID', 2)
    run = root / ns.run_id
    if run.is_symlink() or not run.is_dir():
        die('run folder not found or unsafe', 2)
    try:
        slip, exit_code = evaluate_gate(run, ns.gate)
        path = gate_path(run, f'gates/{ns.gate}.json')
        path.parent.mkdir(mode=0o700, exist_ok=True)
        # Exclusive temp file + replace keeps readers from seeing a half-written slip.
        temp = gate_path(run, f'gates/.{ns.gate}-{uuid.uuid4().hex}.tmp')
        text = json.dumps(slip, ensure_ascii=True, separators=(',', ':'))
        try:
            write_new(temp, text + '\n')
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)
    except (OSError, ValueError, TypeError, KeyError):
        die('gate files unavailable, invalid, or unsafe', 2)
    print(text)
    sys.exit(exit_code)


# ---------------------------------------------------------------- standalone modules (B2)
class ModuleFailure(Exception):
    def __init__(self, code, exit_code=20):
        self.code, self.exit_code = code, exit_code
        super().__init__(code)


def module_config():
    base = pathlib.Path(__file__).resolve().parents[1]
    return base.parents[1], json.loads((base / 'modules.json').read_bytes())


def module_run_folder(run_id):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', run_id):
        raise ModuleFailure('RUN_NOT_FOUND', 2)
    root = pathlib.Path(os.environ.get('SHOPEE_FLOW_RUNS', str(MODULE_DATA / 'runs'))).expanduser().resolve()
    run = root / run_id
    if run.is_symlink() or not run.is_dir():
        raise ModuleFailure('RUN_NOT_FOUND', 2)
    return run


def module_atomic_json(run, relative, value):
    path = gate_path(run, relative)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = gate_path(run, str(path.relative_to(run)) + '.' + uuid.uuid4().hex + '.tmp')
    try:
        write_new(temp, json.dumps(value, ensure_ascii=True) + '\n')
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def module_pid_live(pid):
    if type(pid) is not int or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        try:
            status = pathlib.Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[0]
            if status in ('Z', 'X'):
                return False
        except (OSError, IndexError):
            pass
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def module_busy_check(run):
    state = gate_read(gate_path(run, 'state.json'))
    if isinstance(state, dict) and state.get('status') == 'RUNNING':
        if module_pid_live(state.get('pid')):
            raise ModuleFailure('RUN_BUSY', 24)
        module_atomic_json(run, 'state.json', {**state, 'status': 'STOPPED', 'errorCode': 'RUN_INTERRUPTED',
                                             'endedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
        return True
    return False


def module_blocking(run, module, manual=False, owner_pid=None):
    """Pure shared start decision: queries and execution use identical precedence."""
    state = gate_read(gate_path(run, 'state.json'))
    if (isinstance(state, dict) and state.get('status') == 'RUNNING' and
            module_pid_live(state.get('pid')) and state.get('pid') != owner_pid):
        return {'code': 'RUN_BUSY', 'gate': None}, 24
    if owner_pid is None:
        import fcntl
        path = gate_path(run, '.module.lock')
        if path.exists():
            with open(path, 'r') as lock:
                try:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
                except BlockingIOError:
                    return {'code': 'RUN_BUSY', 'gate': None}, 24
    if module == 'm3':
        for folder in ('review-counts', 'm3-custom/attempts'):
            root = gate_path(run, folder)
            for child in root.iterdir() if root.is_dir() else []:
                state = gate_read(gate_path(run, f'{folder}/{child.name}/state.json'))
                if not isinstance(state, dict) or state.get('status') in ('RUNNING', 'UNCERTAIN'):
                    return {'code': 'SUBMISSION_UNCERTAIN', 'gate': None}, 20
    previous, relative = {'m1': ('entry', 'request.json'), 'm2': ('m1', 'm1/'),
                          'm3': ('m2', 'm2/selection.json')}[module]
    if not (module == 'm2' and manual):
        error, code = gate_prerequisite(run, previous, gate_hash(run, relative))
        if error:
            return {'code': error, 'gate': previous}, code
    if module in ('m1', 'm3') and module_readonly():
        return {'code': 'READONLY_ON', 'gate': None}, 20
    if module == 'm1' and gate_path(run, 'm1').exists():
        return {'code': 'M1_OUTPUT_EXISTS', 'gate': None}, 20
    return None, 0


def module_readonly():
    return os.environ.get('TDN_SHOPEE_FLOW_READONLY') == '1' or READONLY_FILE.exists()


def module_barrier(run, module, manual=False, owner_pid=None):
    blocked, code = module_blocking(run, module, manual, owner_pid)
    if blocked:
        raise ModuleFailure(blocked['code'], code)


def module_failure_slip(run, module, error, config, manual=False):
    inp = {'m1': 'request.json', 'm2': None if manual else 'm1/', 'm3': 'm2/selection.json'}[module]
    out = {'m1': 'm1/', 'm2': 'm2/selection.json', 'm3': 'm3/'}[module]
    version = next(m['skillVersion'] for m in config['modules'] if m['id'] == module.upper())
    return {'format': 'handoff-v1', 'module': module.upper(), 'runId': run.name, 'skillVersion': version,
            'verdict': 'WAIT_OWNER' if error in config['params']['handToOwnerCodes'] else 'FAIL',
            'inputSha256': gate_hash(run, inp) if inp else None, 'outputSha256': gate_hash(run, out),
            'checks': [], 'errorCode': error, 'next': None}


def module_launch_admission(run, module, ns, repo, config):
    """Pure/offline launch validation, shared by detached acceptance and execution."""
    import shlex
    command = config['params'].get('nodeCommand', ['node', '--import', 'tsx'])
    command = shlex.split(command) if isinstance(command, str) else command
    if not isinstance(command, list) or not command or not all(isinstance(c, str) and c for c in command):
        raise ModuleFailure('NODE_COMMAND_INVALID')
    if module == 'm3':
        review_sampling_script(repo, config, 'idle', run)
    if module == 'm2' and getattr(ns, 'manual', None):
        selection = gate_read(pathlib.Path(ns.manual).expanduser())
        schema = gate_read(repo / 'skills/tdn-shopee-flow/chuan/selection-v1.schema.json')
        if (not isinstance(selection, dict) or selection.get('runId') != run.name or
                selection.get('source') != 'manual' or selection.get('pickRuleVersion') != 'manual' or
                selection.get('metricInputSha256') is not None or not gate_schema(selection, schema)):
            raise ModuleFailure('MANUAL_SELECTION_INVALID')
        return command, selection, None
    entry, entry_code = evaluate_gate(run, 'entry')
    if entry_code:
        raise ModuleFailure(entry.get('errorCode') or 'MODULE_INPUT_INVALID', entry_code)
    request = gate_read(gate_path(run, 'request.json'))
    if module == 'm1':
        if not isinstance(request, dict) or not isinstance(request.get('captureSpec'), dict):
            raise ModuleFailure('CAPTURE_SPEC_MISSING')
        if gate_path(run, 'm1').exists():
            raise ModuleFailure('M1_OUTPUT_EXISTS')
        db = os.environ.get('TDN_WORKSPACE_DB')
        if not db:
            raise ModuleFailure('APP_DB_NOT_CONFIGURED')
    return command, None, request


def module_work(run, module, ns, repo, config):
    command, selection, request = module_launch_admission(run, module, ns, repo, config)
    if selection is not None:
        flow_accept_launch(run, (gate_read(gate_path(run, 'state.json')) or {}).get('startedAt') or flow_now())
        module_atomic_json(run, 'm2/selection.json', selection)
        return None
    if module == 'm1':
        flow_accept_launch(run, (gate_read(gate_path(run, 'state.json')) or {}).get('startedAt') or flow_now())
        module_atomic_json(run, 'capture-spec.json', request['captureSpec'])
        args = [str(repo / 'scripts/capture-metric-preset.ts'), str(run / 'capture-spec.json'), str(run / 'm1'), os.environ['TDN_WORKSPACE_DB']]
    else:
        args = [str(repo / ('scripts/module-pick.ts' if module == 'm2' else 'scripts/module-collect-public.ts')), str(run)]
        flow_accept_launch(run, (gate_read(gate_path(run, 'state.json')) or {}).get('startedAt') or flow_now())
    # A single process, no shell, no automatic retry; captured diagnostics never reach the slip/stdout.
    result = subprocess.run([*command, *args], cwd=repo, capture_output=True, text=True)
    if result.returncode:
        try:
            output = json.loads(result.stdout)
            error = (output.get('errorCode') or (output.get('code') if module == 'm1' else None)) if isinstance(output, dict) else None
        except ValueError:
            error = None
        if not isinstance(error, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', error):
            error = 'MODULE_FAILED'
        return error
    return None


def flow_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def flow_tracking_record(run):
    path = gate_path(run, 'run-tracking.json')
    if not path.exists():
        return None
    value = gate_read(path)
    repo, _ = module_config()
    schema = gate_read(repo / 'contracts/foundation/shopee-module-review-data.schema.json')
    definition = flow_expand_schema(schema['$defs']['trackingRecord'], schema)
    if not gate_schema(value, definition) or value['runId'] != run.name:
        raise ModuleFailure('RUN_TRACKING_INVALID', 2)
    if value['historyBasis'] == 'legacy-first-unproven' and value['firstRunAt'] is not None:
        raise ModuleFailure('RUN_TRACKING_INVALID', 2)
    return value


def flow_write_tracking(run, value):
    # Caller owns the run flock. Keep this outside all acquisition hash scopes.
    path = gate_path(run, 'run-tracking.json')
    temp = gate_path(run, '.tracking-' + uuid.uuid4().hex + '.tmp')
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w', encoding='utf8') as output:
            json.dump(value, output, ensure_ascii=False)
            output.write('\n'); output.flush(); os.fsync(output.fileno())
        os.replace(temp, path)
        parent = os.open(run, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        temp.unlink(missing_ok=True)


def flow_accept_launch(run, at):
    record = flow_tracking_record(run)
    if record and (record['firstRunAt'] or record['firstObservedLaunchAt']):
        return
    request = gate_read(gate_path(run, 'request.json'))
    keywords = request.get('preset', {}).get('keywords', []) if isinstance(request, dict) else []
    if not keywords or not isinstance(keywords[0], str) or not keywords[0].strip():
        if record is None:
            return  # Legacy manual M2 can exist without a request; first time stays unknown.
        raise ModuleFailure('RUN_TRACKING_INVALID', 2)
    digest = gate_hash(run, 'request.json')
    if record is None:
        record = {'format': 'run-tracking-v1', 'runId': run.name, 'requestSha256': digest,
                  'primaryKeyword': keywords[0], 'createdAt': None, 'firstRunAt': None,
                  'firstObservedLaunchAt': at, 'historyBasis': 'legacy-first-unproven'}
    else:
        if record['requestSha256'] != digest:
            raise ModuleFailure('RUN_TRACKING_CHANGED', 23)
        record = {**record, 'firstRunAt': at}
    flow_write_tracking(run, record)


def flow_tracking(run):
    record = flow_tracking_record(run)
    request = gate_read(gate_path(run, 'request.json'))
    keywords = request.get('preset', {}).get('keywords', []) if isinstance(request, dict) else []
    state = gate_read(gate_path(run, 'state.json'))
    last = state.get('startedAt') if isinstance(state, dict) else None
    return {'primaryKeyword': record['primaryKeyword'] if record else (keywords[0] if keywords else None),
            'firstRunAt': record['firstRunAt'] if record else None,
            'timeBasis': ('recorded-first-accepted' if record['firstRunAt'] else
                          'not-started' if record['historyBasis'] == 'new-run' else 'legacy-first-unproven') if record else 'legacy-first-unproven',
            'displayTimezone': 'Asia/Ho_Chi_Minh', 'lastKnownStartedAt': last}


def flow_state(run, status='IDLE', mode=None, module=None, pid=None, started=None, error=None, failed=None):
    return {'format': 'state-v1', 'runId': run.name, 'status': status, 'mode': mode,
            'module': module, 'pid': pid, 'startedAt': started,
            'endedAt': flow_now() if status in ('STOPPED', 'DONE') or started and status == 'IDLE' else None,
            'errorCode': error, 'failedCheck': failed}


def flow_failed(slip):
    return [c['id'] for c in slip['checks'] if not c['ok'] and c.get('level') != 'warn']


def module_execute(run, module, ns, repo, config):
    """One locked module; no printing, no nested lock and no retry."""
    manual = bool(getattr(ns, 'manual', None))
    work_started, start_refused = False, False
    try:
        module_barrier(run, module, manual, os.getpid())
        work_started = True
        error = module_work(run, module, ns, repo, config)
        slip, code = evaluate_gate(run, module)
        if error:
            slip.update(verdict='WAIT_OWNER' if error in config['params']['handToOwnerCodes'] else 'FAIL', errorCode=error, next=None)
            code = {'GATE_NOT_PASSED': 22, 'GATE_INPUT_CHANGED': 23}.get(error, 21 if slip['verdict'] == 'WAIT_OWNER' else 20)
    except ModuleFailure as failure:
        start_refused = not work_started
        slip, code = module_failure_slip(run, module, failure.code, config, manual), failure.exit_code
    except (OSError, ValueError, KeyError, TypeError):
        slip, code = module_failure_slip(run, module, 'MODULE_IO_FAILED', config, manual), 20
    except KeyboardInterrupt:
        slip, code = module_failure_slip(run, module, 'RUN_INTERRUPTED', config, manual), 20
    if not start_refused or not gate_path(run, f'gates/{module}.json').exists():
        module_atomic_json(run, f'gates/{module}.json', slip)
    return slip, code


def flow_result(run_id, command, slip, code, error=None):
    failed = flow_failed(slip) if slip else []
    error = error or (slip['errorCode'] if slip else None)
    if command == 'run':
        return {'format': 'run-result-v1', 'runId': run_id, 'status': 'DONE' if code == 0 else 'STOPPED',
                'stoppedAt': None if code == 0 else (slip['module'].lower() if slip else 'entry'),
                'errorCode': error, 'failedCheck': failed[0] if failed else None}
    return {'format': 'module-result-v1', 'runId': run_id, 'module': command.upper(),
            'verdict': slip['verdict'] if slip else 'FAIL', 'errorCode': error,
            'failedChecks': failed, 'slip': f'gates/{command}.json'}


def flow_detach(run, ns, lock, started):
    """Pass the held flock to the worker; a pipe releases it only after PID publication.

    If the parent dies before publication, EOF makes the worker exit without work.
    The inherited lock covers both sides of the handoff, including the start race.
    """
    read_fd, write_fd = os.pipe()
    child = None
    try:
        logs = gate_path(run, 'logs')
        logs.mkdir(mode=0o700, exist_ok=True)
        log = gate_path(run, f'logs/{time.time_ns()}-{ns.cmd}.log')
        args = [sys.executable, str(pathlib.Path(__file__).resolve()), ns.cmd, '--run', run.name,
                '--worker-lock-fd', str(lock.fileno()), '--worker-ready-fd', str(read_fd)]
        if getattr(ns, 'manual', None):
            args += ['--manual', str(pathlib.Path(ns.manual).expanduser().resolve())]
        with open(log, 'x', encoding='utf8') as output:
            os.chmod(log, 0o600)
            child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                     start_new_session=True, pass_fds=(lock.fileno(), read_fd))
        module_atomic_json(run, 'state.json', flow_state(run, 'RUNNING', 'flow' if ns.cmd == 'run' else 'single',
                           'ENTRY' if ns.cmd == 'run' else ns.cmd.upper(), child.pid, started))
        flow_accept_launch(run, started)
        os.write(write_fd, b'1')
        return {'format': 'detached-v1', 'runId': run.name, 'pid': child.pid}
    finally:
        os.close(read_fd)
        os.close(write_fd)


def cmd_module(ns):
    if ns.cmd == 'm3' and getattr(ns, 'plan_sha256', None):
        return cmd_review_sampling(ns)
    import fcntl
    run, lock, slip, code, started, error = None, None, None, 0, None, None
    interrupted, work_started = False, False
    mode = 'flow' if ns.cmd == 'run' else 'single'
    module = 'entry' if ns.cmd == 'run' else ns.cmd
    try:
        run = module_run_folder(ns.run_id)
        repo, config = module_config()
        worker_fd = getattr(ns, 'worker_lock_fd', None)
        ready_fd = getattr(ns, 'worker_ready_fd', None)
        if worker_fd is not None:
            if ready_fd is None or worker_fd < 3 or ready_fd < 3 or ready_fd == worker_fd:
                raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
            lock = os.fdopen(worker_fd, 'a')
            expected = gate_path(run, '.module.lock').stat()
            actual = os.fstat(lock.fileno())
            if (expected.st_dev, expected.st_ino) != (actual.st_dev, actual.st_ino):
                raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
            try:
                if os.read(ready_fd, 1) != b'1':
                    raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
            finally:
                os.close(ready_fd)
            state = gate_read(gate_path(run, 'state.json'))
            if not isinstance(state, dict) or state.get('pid') != os.getpid() or state.get('status') != 'RUNNING':
                raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
            started = state.get('startedAt')
        else:
            if ready_fd is not None:
                raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
            lock = open(gate_path(run, '.module.lock'), 'a')
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ModuleFailure('RUN_BUSY', 24)
        if worker_fd is None:
            interrupted = module_busy_check(run)
            started = flow_now()
        if ns.cmd == 'run':
            slip, code = evaluate_gate(run, 'entry')
            module_atomic_json(run, 'gates/entry.json', slip)
        if code == 0 and getattr(ns, 'detach', False):
            module = 'm1' if ns.cmd == 'run' else module
            module_barrier(run, module, bool(getattr(ns, 'manual', None)), os.getpid())
            module_launch_admission(run, module, ns, repo, config)
            result = flow_detach(run, ns, lock, started)
            print(json.dumps(result))
            return
        if code == 0:
            for module in (('m1', 'm2', 'm3') if ns.cmd == 'run' else (ns.cmd,)):
                module_barrier(run, module, bool(getattr(ns, 'manual', None)), os.getpid())
                work_started = True
                module_atomic_json(run, 'state.json', flow_state(run, 'RUNNING', mode, module.upper(), os.getpid(), started))
                slip, code = module_execute(run, module, ns, repo, config)
                if code:
                    break
        failed = flow_failed(slip)
        module_atomic_json(run, 'state.json', flow_state(run, ('DONE' if module == 'm3' else 'IDLE') if code == 0 else 'STOPPED',
                           mode, module.upper(), os.getpid(), started, slip['errorCode'], failed[0] if failed else None))
    except ModuleFailure as failure:
        error, code = failure.code, failure.exit_code
        if run is not None and started and code not in (2, 24):
            if module != 'entry':
                slip = module_failure_slip(run, module, error, config, bool(getattr(ns, 'manual', None)))
                start_refused = error in ('RUN_BUSY', 'GATE_NOT_PASSED', 'GATE_INPUT_CHANGED', 'READONLY_ON', 'M1_OUTPUT_EXISTS')
                if not start_refused or not gate_path(run, f'gates/{module}.json').exists():
                    module_atomic_json(run, f'gates/{module}.json', slip)
            if not interrupted or work_started:
                module_atomic_json(run, 'state.json', flow_state(run, 'STOPPED', mode, module.upper(), os.getpid(), started, error))
    except (OSError, ValueError, KeyError, TypeError):
        error, code = 'MODULE_IO_FAILED', 20
        if run is not None and started:
            module_atomic_json(run, 'state.json', flow_state(run, 'STOPPED', mode, module.upper(), os.getpid(), started, error))
    finally:
        if lock is not None:
            lock.close()
    if code == 2:
        print(json.dumps({'format': 'error-v1', 'code': error, 'message': error}))
    else:
        print(json.dumps(flow_result(ns.run_id, ns.cmd, slip, code, error)))
    sys.exit(code)


def review_sampling_script(repo, config, action, run, *args, input_text=None):
    """The canonical TS boundary owns validation; never relay subprocess diagnostics."""
    import shlex
    command = config['params'].get('nodeCommand', ['node', '--import', 'tsx'])
    command = shlex.split(command) if isinstance(command, str) else command
    if not isinstance(command, list) or not command or not all(isinstance(c, str) and c for c in command):
        raise ModuleFailure('NODE_COMMAND_INVALID')
    result = subprocess.run([*command, str(repo / 'scripts/module-review-sampling.ts'), action, str(run), *args],
                            cwd=repo, input=input_text, capture_output=True, text=True)
    try:
        value = json.loads(result.stdout)
    except ValueError:
        raise ModuleFailure('REVIEW_COMMAND_FAILED')
    if result.returncode or not isinstance(value, dict) or value.get('format') == 'error-v1':
        code = value.get('code') if isinstance(value, dict) else None
        if not isinstance(code, str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', code):
            code = 'REVIEW_COMMAND_FAILED'
        raise ModuleFailure(code, result.returncode if result.returncode in (2, 20, 21, 22, 23, 24) else 20)
    return value


def cmd_review_sampling(ns):
    """Stable exact-attempt control, sharing the legacy run lock but not its artifacts."""
    import fcntl
    lock = None
    try:
        run = module_run_folder(ns.run_id)
        repo, config = module_config()
        if ns.cmd in ('review-sampling', 'save-review-plan'):
            text = sys.stdin.buffer.read(65537).decode('utf8') if ns.cmd == 'save-review-plan' else None
            if text is not None and len(text.encode('utf8')) > 65536:
                raise ModuleFailure('REVIEW_INPUT_INVALID', 2)
            value = review_sampling_script(repo, config, 'view' if ns.cmd == 'review-sampling' else 'save', run, input_text=text)
        elif ns.cmd == 'stop-review-attempt':
            value = review_sampling_script(repo, config, 'stop', run, ns.kind, ns.attempt)
        else:
            worker = ns.cmd == 'review-attempt-worker'
            if worker:
                fd, ready = ns.worker_lock_fd, ns.worker_ready_fd
                if fd is None or ready is None or fd < 3 or ready < 3 or fd == ready:
                    raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
                lock = os.fdopen(fd, 'a')
                expected, actual = gate_path(run, '.module.lock').stat(), os.fstat(fd)
                if (expected.st_dev, expected.st_ino) != (actual.st_dev, actual.st_ino):
                    raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
                try:
                    if os.read(ready, 1) != b'1':
                        raise ModuleFailure('WORKER_HANDOFF_INVALID', 2)
                finally:
                    os.close(ready)
            else:
                lock = open(gate_path(run, '.module.lock'), 'a')
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ModuleFailure('RUN_BUSY', 24)
            if module_readonly():
                raise ModuleFailure('READONLY_ON')
            recovering = ns.cmd == 'reconcile-review-attempt' or worker and ns.reconcile
            if not recovering:
                error, exit_code = gate_prerequisite(run, 'm2', gate_hash(run, 'm2/selection.json'))
                if error:
                    raise ModuleFailure(error, exit_code)
            if worker:
                value = review_sampling_script(repo, config, 'execute', run, ns.kind, ns.attempt,
                                               'reconcile' if ns.reconcile else 'initial')
            else:
                reconcile = ns.cmd == 'reconcile-review-attempt'
                kind = ns.kind if reconcile else 'counts' if ns.cmd == 'review-counts' else 'custom'
                if reconcile:
                    value = review_sampling_script(repo, config, 'reconcile-check', run, kind, ns.attempt)
                    if value.get('status') != 'RUNNING':
                        print(json.dumps(value))
                        return
                else:
                    value = review_sampling_script(repo, config, 'reserve', run, kind,
                                                   *([ns.plan_sha256] if kind == 'custom' else []))
                    if kind == 'custom':
                        flow_accept_launch(run, flow_now())
                attempt_id = value['attemptId']
                if getattr(ns, 'detach', False):
                    read_fd, write_fd = os.pipe()
                    try:
                        logs = gate_path(run, 'logs'); logs.mkdir(mode=0o700, exist_ok=True)
                        args = [sys.executable, str(pathlib.Path(__file__).resolve()), 'review-attempt-worker', '--run', run.name,
                                '--kind', kind, '--attempt', attempt_id, '--worker-lock-fd', str(lock.fileno()),
                                '--worker-ready-fd', str(read_fd)]
                        if reconcile:
                            args += ['--reconcile']
                        log = gate_path(run, f'logs/{time.time_ns()}-{attempt_id}.log')
                        with open(log, 'x', encoding='utf8') as output:
                            os.chmod(log, 0o600)
                            child = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                                     start_new_session=True, pass_fds=(lock.fileno(), read_fd))
                        folder = 'review-counts' if kind == 'counts' else 'm3-custom/attempts'
                        relative = f'{folder}/{attempt_id}/state.json'
                        state = gate_read(gate_path(run, relative))
                        module_atomic_json(run, relative, {**state, 'status': 'RUNNING', 'pid': child.pid})
                        os.write(write_fd, b'1')
                        value.update(pid=child.pid, status='RUNNING')
                    finally:
                        os.close(read_fd); os.close(write_fd)
                else:
                    value = review_sampling_script(repo, config, 'execute', run, kind, attempt_id,
                                                   'reconcile' if reconcile else 'initial')
        print(json.dumps(value, ensure_ascii=True))
        if value.get('status') in ('FAILED', 'UNCERTAIN'):
            sys.exit(21 if value.get('errorCode') in ('HUMAN_LOGIN_REQUIRED', 'HUMAN_VERIFICATION_REQUIRED') else 20)
    except ModuleFailure as error:
        print(json.dumps({'format': 'error-v1', 'code': error.code, 'message': error.code}))
        sys.exit(error.exit_code)
    except (OSError, ValueError, TypeError, KeyError):
        print(json.dumps({'format': 'error-v1', 'code': 'REVIEW_INPUT_INVALID', 'message': 'REVIEW_INPUT_INVALID'}))
        sys.exit(2)
    finally:
        if lock is not None:
            lock.close()


def cmd_review_data(ns):
    """Offline exact-source save/export; never loads defaults or acquires provider clients."""
    import fcntl, shlex
    lock = None
    binary = ns.cmd == 'read-review-export'
    try:
        run = module_run_folder(ns.run_id)
        repo, config = module_config()
        if ns.cmd in ('save-review-data', 'export-review-data'):
            lock = open(gate_path(run, '.module.lock'), 'a')
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ModuleFailure('RUN_BUSY', 24)
        command = config['params'].get('nodeCommand', ['node', '--import', 'tsx'])
        command = shlex.split(command) if isinstance(command, str) else command
        if not isinstance(command, list) or not command or not all(isinstance(c, str) and c for c in command):
            raise ModuleFailure('NODE_COMMAND_INVALID', 2)
        action = {'review-data': 'view', 'save-review-data': 'save', 'export-review-data': 'export', 'read-review-export': 'read'}[ns.cmd]
        payload = None
        if ns.cmd in ('save-review-data', 'export-review-data'):
            payload = sys.stdin.buffer.read(65537)
            if len(payload) > 65536:
                raise ModuleFailure('REVIEW_DATA_INVALID', 2)
        args = [*command, str(repo / 'scripts/module-review-data.ts'), action, str(run)]
        if binary:
            if not re.fullmatch(r'[a-f0-9]{64}', ns.export_sha256):
                raise ModuleFailure('REVIEW_DATA_INVALID', 2)
            args.append(ns.export_sha256)
        result = subprocess.run(args, cwd=repo, input=payload,
                                stdout=None if binary else subprocess.PIPE, stderr=subprocess.PIPE)
        if binary:
            if result.returncode:
                code = result.stderr.decode('ascii', 'ignore').strip()
                raise ModuleFailure(code if re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', code) else 'REVIEW_DATA_FAILED', 20)
            return
        try:
            value = json.loads(result.stdout)
        except ValueError:
            raise ModuleFailure('REVIEW_DATA_FAILED', 20)
        if result.returncode or not isinstance(value, dict) or value.get('format') == 'error-v1':
            code = value.get('code') if isinstance(value, dict) else None
            raise ModuleFailure(code if isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', code) else 'REVIEW_DATA_FAILED',
                                result.returncode if result.returncode in (2, 20, 23, 24) else 20)
        print(json.dumps(value, ensure_ascii=True))
    except (ModuleFailure, OSError, ValueError, TypeError, KeyError) as error:
        code = error.code if isinstance(error, ModuleFailure) else 'REVIEW_DATA_FAILED'
        if binary:
            print(code, file=sys.stderr)
        else:
            print(json.dumps({'format': 'error-v1', 'code': code, 'message': code}))
        sys.exit(error.exit_code if isinstance(error, ModuleFailure) else 20)
    finally:
        if lock is not None:
            lock.close()


def flow_presets_root():
    return pathlib.Path(os.environ.get('SHOPEE_FLOW_PRESETS', str(MODULE_DATA / 'presets'))).expanduser()


def flow_add_product():
    """Save a complete, locally validated preset without starting any module."""
    import fcntl
    import unicodedata

    def unique_object(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('duplicate input key')
            value[key] = item
        return value

    try:
        source = sys.stdin.read(65537)
        if len(source.encode('utf8')) > 65536:
            raise ValueError('oversized input')
        value = json.loads(source, object_pairs_hook=unique_object,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError('invalid constant')))
    except ValueError:
        raise ModuleFailure('PRODUCT_INPUT_INVALID', 2)
    repo, config = module_config()
    try:
        result = subprocess.run([*config['params']['nodeCommand'], str(repo / 'scripts/build-shopee-product-preset.ts')],
                                cwd=repo, input=json.dumps(value, ensure_ascii=False, separators=(',', ':')), capture_output=True,
                                encoding='utf8', timeout=30)
        preset = json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise ModuleFailure('PRESET_WRITE_FAILED', 2)
    if result.returncode:
        code = preset.get('code') if isinstance(preset, dict) else None
        raise ModuleFailure(code if code in ('PRODUCT_INPUT_INVALID', 'PRODUCT_CATEGORY_UNSUPPORTED')
                            else 'PRESET_WRITE_FAILED', 2)
    root = flow_presets_root()
    key = lambda s: ' '.join(unicodedata.normalize('NFC', s).split()).casefold()
    temp = '.' + uuid.uuid4().hex + '.tmp'
    try:
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Pin the directory and refuse symlinks, including the lock and destination.
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            lock_fd = os.open('.presets.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600, dir_fd=root_fd)
            with os.fdopen(lock_fd, 'a') as lock:
                try:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise ModuleFailure('PRESET_BUSY', 2)
                for name in os.listdir(root_fd):
                    if not name.endswith('.json'):
                        continue
                    if name[:-5].casefold() == preset['presetId'].casefold():
                        raise ModuleFailure('PRESET_ID_EXISTS', 2)
                    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=root_fd)
                    with os.fdopen(fd) as stored:
                        previous = json.load(stored)
                    if not isinstance(previous, dict) or not isinstance(previous.get('label'), str):
                        raise ModuleFailure('PRESET_WRITE_FAILED', 2)
                    if key(previous['label']) == key(preset['label']):
                        raise ModuleFailure('PRESET_NAME_EXISTS', 2)
                fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root_fd)
                try:
                    with os.fdopen(fd, 'w') as output:
                        json.dump(preset, output, ensure_ascii=True)
                        output.write('\n')
                        output.flush()
                        os.fsync(output.fileno())
                    # Publish complete bytes atomically; an existing name is never replaced.
                    os.link(temp, preset['presetId'] + '.json', src_dir_fd=root_fd, dst_dir_fd=root_fd,
                            follow_symlinks=False)
                    os.fsync(root_fd)
                finally:
                    os.unlink(temp, dir_fd=root_fd)
        finally:
            os.close(root_fd)
    except FileExistsError:
        raise ModuleFailure('PRESET_ID_EXISTS', 2)
    except (OSError, ValueError):
        raise ModuleFailure('PRESET_WRITE_FAILED', 2)
    return {'format': 'add-product-v1', 'presetId': preset['presetId'], 'label': preset['label']}


def flow_preset(path):
    value = gate_read(path)
    if not isinstance(value, dict) or value.get('format') != 'preset-v1' or value.get('presetId') != path.stem:
        raise ModuleFailure('PRESET_INVALID', 2)
    body = value.get('preset')
    if not isinstance(body, dict):
        raise ModuleFailure('PRESET_INVALID', 2)
    # R5 builder saves every defaults field except windows; older exports save fields directly.
    spec = body if 'preset' in body else {'contractVersion': 'metric-v3-capture-spec-v2', 'preset': body}
    fields = spec.get('preset')
    if not isinstance(fields, dict) or not isinstance(fields.get('keywords'), list):
        raise ModuleFailure('PRESET_INVALID', 2)
    return value, spec


def flow_expand_schema(schema, root=None):
    """Resolve only local references in the existing canonical capture schema."""
    root = schema if root is None else root
    if isinstance(schema, list):
        return [flow_expand_schema(s, root) for s in schema]
    if not isinstance(schema, dict):
        return schema
    if '$ref' in schema:
        ref = schema['$ref']
        if not ref.startswith('#/$defs/'):
            raise ValueError('unsupported schema reference')
        return flow_expand_schema(root['$defs'][ref.split('/')[-1]], root)
    return {k: flow_expand_schema(v, root) for k, v in schema.items() if k != '$defs'}


def flow_new_run():
    value = json.load(sys.stdin)
    if not isinstance(value, dict) or set(value) - {'presetId', 'endDate', 'reviewCapPerLink'}:
        raise ModuleFailure('NEW_RUN_INPUT_INVALID', 2)
    preset_id, end_date, cap = value.get('presetId'), value.get('endDate'), value.get('reviewCapPerLink')
    if not isinstance(preset_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', preset_id):
        raise ModuleFailure('PRESET_NOT_FOUND', 2)
    preset_path = flow_presets_root() / (preset_id + '.json')
    if not preset_path.is_file() or preset_path.is_symlink():
        raise ModuleFailure('PRESET_NOT_FOUND', 2)
    preset, spec = flow_preset(preset_path)
    repo, config = module_config()
    limits = config['params']['reviewCapPerLink']
    if not gate_date(end_date) or type(cap) is not int or not limits['min'] <= cap <= limits['max']:
        raise ModuleFailure('NEW_RUN_INPUT_INVALID', 2)
    end = dt.date.fromisoformat(end_date)
    windows = [{'id': w['id'], 'period': {'startDate': (end + dt.timedelta(days=w['startOffsetDays'])).isoformat(),
                'endDate': end_date}, 'intervalDays': w['intervalDays']} for w in config['params']['windows']]
    spec = {**spec, 'windows': windows}
    name = 'metric-v3-capture-spec-v1.schema.json' if spec.get('contractVersion') == 'metric-v3-capture-spec-v1' else 'metric-v3-capture-spec.schema.json'
    schema = gate_read(repo / 'contracts/analysis' / name)
    titles = preset.get('principalTitles', [])
    if (not gate_schema(spec, flow_expand_schema(schema)) or not isinstance(titles, list) or
            not all(isinstance(t, str) for t in titles)):
        raise ModuleFailure('PRESET_INVALID', 2)
    request = {'format': 'request-v1', 'preset': {'keywords': spec['preset']['keywords']}, 'windows': windows,
               'reviewCapPerLink': cap, 'principalTitles': titles, 'captureSpec': spec}
    root = pathlib.Path(os.environ.get('SHOPEE_FLOW_RUNS', str(MODULE_DATA / 'runs'))).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    while True:
        run = root / uuid.uuid4().hex[:8]
        try:
            run.mkdir(mode=0o700)
            break
        except FileExistsError:
            continue
    module_atomic_json(run, 'request.json', request)
    module_atomic_json(run, 'state.json', flow_state(run))
    flow_write_tracking(run, {'format': 'run-tracking-v1', 'runId': run.name,
                             'requestSha256': gate_hash(run, 'request.json'), 'primaryKeyword': spec['preset']['keywords'][0],
                             'createdAt': flow_now(), 'firstRunAt': None, 'firstObservedLaunchAt': None, 'historyBasis': 'new-run'})
    return {'format': 'new-run-v1', 'runId': run.name}


def flow_run_info(run, config):
    request = gate_read(gate_path(run, 'request.json'))
    modules = []
    for m in config['modules']:
        module = m['id'].lower()
        blocked, _ = module_blocking(run, module)
        modules.append({'id': m['id'], 'title': m['title'], 'skill': m['skill'],
                        'inputGate': {'m1': 'entry', 'm2': 'm1', 'm3': 'm2'}[module],
                        'outputGate': m['gate'], 'canRun': blocked is None, 'blockedBy': blocked})
    return {'format': 'run-info-v1', 'runId': run.name, 'readonly': module_readonly(),
            'tracking': flow_tracking(run),
            'request': {k: v for k, v in request.items() if k != 'captureSpec'} if isinstance(request, dict) else None,
            'state': gate_read(gate_path(run, 'state.json')) or flow_state(run), 'modules': modules,
            'gates': {g: gate_read(gate_path(run, f'gates/{g}.json')) for g in ('entry', 'm1', 'm2', 'm3')},
            'selection': gate_read(gate_path(run, 'm2/selection.json'))}


def cmd_flow_query(ns):
    try:
        if ns.cmd == 'connection':
            root = pathlib.Path(os.environ.get('SHOPEE_FLOW_RUNS', str(MODULE_DATA / 'runs'))).expanduser().absolute()
            try:
                relative = root.relative_to(HOME)
                display = '~' if str(relative) == '.' else '~/' + relative.as_posix()
            except ValueError:
                display = str(root)
            print(json.dumps({'format': 'connection-v1', 'readonly': module_readonly(), 'runsRoot': display}))
            return
        repo, config = module_config()
        if ns.cmd == 'add-product':
            result = flow_add_product()
        elif ns.cmd == 'new-run':
            result = flow_new_run()
        elif ns.cmd == 'presets':
            values = []
            for path in sorted(flow_presets_root().glob('*.json')):
                if path.is_symlink():
                    continue
                value, spec = flow_preset(path)
                fields = spec['preset']
                values.append({'presetId': value['presetId'], 'label': value['label'], 'keywords': fields['keywords'],
                               'categoryLabel': fields.get('category', {}).get('label'), 'source': value['source']})
            result = {'format': 'presets-v1', 'presets': values}
        elif ns.cmd == 'run-info':
            result = flow_run_info(module_run_folder(ns.run_id), config)
        elif ns.cmd == 'runs':
            root = pathlib.Path(os.environ.get('SHOPEE_FLOW_RUNS', str(MODULE_DATA / 'runs'))).expanduser()
            values = []
            for path in root.iterdir() if root.is_dir() else []:
                if path.is_symlink() or not path.is_dir() or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}', path.name):
                    continue
                request_path = gate_path(path, 'request.json')
                request = gate_read(request_path)
                if not isinstance(request, dict):
                    continue
                state = gate_read(gate_path(path, 'state.json')) or flow_state(path)
                slips = [(gate_path(path, f'gates/{g}.json'), g) for g in ('entry', 'm1', 'm2', 'm3')]
                slips = [(p.stat().st_mtime_ns, g, gate_read(p)) for p, g in slips if p.is_file()]
                latest = max(slips, key=lambda x: x[0]) if slips else None
                last = latest[2] if latest and isinstance(latest[2], dict) else {}
                created = dt.datetime.fromtimestamp(request_path.stat().st_mtime, dt.timezone.utc).isoformat()
                values.append({'runId': path.name, 'createdAt': created, 'product': ' / '.join(request.get('preset', {}).get('keywords', [])),
                               'tracking': flow_tracking(path),
                               'status': state.get('status'), 'lastGate': latest[1] if latest else None,
                               'lastVerdict': last.get('verdict'), 'errorCode': state.get('errorCode') or last.get('errorCode')})
            result = {'format': 'runs-v1', 'runs': sorted(values, key=lambda v: (v['createdAt'], v['runId']), reverse=True)}
        else:
            skills = []
            for m in (config['flow'], *config['modules']):
                path = repo / 'skills' / m['skill'] / 'SKILL.md'
                skills.append({'name': m['skill'], 'version': m['skillVersion'], 'text': path.read_text(encoding='utf8')})
            result = {'format': 'library-v1', 'modules': config, 'skills': skills}
        print(json.dumps(result, ensure_ascii=True))
    except ModuleFailure as failure:
        print(json.dumps({'format': 'error-v1', 'code': failure.code, 'message': failure.code}))
        sys.exit(failure.exit_code)
    except (OSError, ValueError, KeyError, TypeError, OverflowError):
        print(json.dumps({'format': 'error-v1', 'code': 'FLOW_INPUT_INVALID', 'message': 'Invalid or unreadable flow input.'}))
        sys.exit(2)


class FlowArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        if len(sys.argv) > 1 and sys.argv[1] == 'read-review-export':
            print('USAGE', file=sys.stderr)
            self.exit(2)
        if len(sys.argv) > 1 and sys.argv[1] in ('connection', 'presets', 'add-product', 'new-run', 'runs', 'run-info', 'library', 'run', 'm1', 'm2', 'm3', 'review-sampling', 'save-review-plan', 'review-counts', 'stop-review-attempt', 'reconcile-review-attempt', 'review-attempt-worker', 'review-data', 'save-review-data', 'export-review-data'):
            print(json.dumps({'format': 'error-v1', 'code': 'USAGE', 'message': 'Invalid command arguments.'}))
            self.exit(2)
        super().error(message)


def main():
    p = FlowArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest='cmd', required=True)
    x = sp.add_parser('gate'); x.add_argument('gate', choices=['entry', 'm1', 'm2', 'm3']); x.add_argument('--run', dest='run_id', required=True); x.set_defaults(f=cmd_gate)
    for name in ('review-data', 'save-review-data', 'export-review-data', 'read-review-export'):
        x = sp.add_parser(name); x.add_argument('--run', dest='run_id', required=True)
        if name in ('save-review-data', 'export-review-data'):
            x.add_argument('--stdin', action='store_true', required=True)
        if name == 'read-review-export':
            x.add_argument('--export-sha256', required=True)
        x.set_defaults(f=cmd_review_data)
    for module in ('m1', 'm2', 'm3', 'run'):
        x = sp.add_parser(module); x.add_argument('--run', dest='run_id', required=True)
        if module == 'm2': x.add_argument('--manual')
        if module == 'm3': x.add_argument('--plan-sha256')
        x.add_argument('--detach', action='store_true')
        x.add_argument('--worker-lock-fd', type=int, help=argparse.SUPPRESS)
        x.add_argument('--worker-ready-fd', type=int, help=argparse.SUPPRESS)
        x.set_defaults(f=cmd_module)
    for name in ('review-sampling', 'save-review-plan', 'review-counts', 'stop-review-attempt', 'reconcile-review-attempt', 'review-attempt-worker'):
        x = sp.add_parser(name); x.add_argument('--run', dest='run_id', required=True)
        if name == 'save-review-plan': x.add_argument('--stdin', action='store_true', required=True)
        if name in ('review-counts', 'reconcile-review-attempt'): x.add_argument('--detach', action='store_true')
        if name in ('stop-review-attempt', 'reconcile-review-attempt', 'review-attempt-worker'):
            x.add_argument('--kind', choices=['counts', 'custom'], required=True); x.add_argument('--attempt', required=True)
        if name == 'review-attempt-worker':
            x.add_argument('--reconcile', action='store_true'); x.add_argument('--worker-lock-fd', type=int); x.add_argument('--worker-ready-fd', type=int)
        x.set_defaults(f=cmd_review_sampling)
    for name in ('connection', 'presets', 'add-product', 'new-run', 'runs', 'run-info', 'library'):
        x = sp.add_parser(name)
        if name in ('new-run', 'add-product'): x.add_argument('--stdin', action='store_true', required=True)
        if name == 'run-info': x.add_argument('--run', dest='run_id', required=True)
        x.set_defaults(f=cmd_flow_query)
    sp.add_parser('status').set_defaults(f=cmd_status)
    sp.add_parser('guard-check').set_defaults(f=cmd_guard_check)
    for name, f in (('run-status', cmd_run_status), ('verify', cmd_verify), ('usage', cmd_usage)):
        x = sp.add_parser(name); x.add_argument('run_id'); x.set_defaults(f=f)
    x = sp.add_parser('watch'); x.add_argument('run_id'); x.add_argument('--max-min', type=int, default=130); x.set_defaults(f=cmd_watch)
    x = sp.add_parser('start'); x.add_argument('--keyword', required=True); x.add_argument('--description')
    x.add_argument('--reports', default='MARKET'); x.add_argument('--workspace')
    for flag in ('--dry-run', '--confirm', '--full-run', '--allow-recent', '--allow-untested-release'): x.add_argument(flag, action='store_true')
    x.set_defaults(f=cmd_start)
    x = sp.add_parser('test-mode'); x.add_argument('state', choices=['on', 'off']); x.add_argument('--cap', type=int, default=10)
    x.add_argument('--confirm', action='store_true'); x.set_defaults(f=cmd_test_mode)
    x = sp.add_parser('recover'); x.add_argument('--confirm', action='store_true'); x.set_defaults(f=cmd_recover)
    ns = p.parse_args(); ns.f(ns)


if __name__ == '__main__':
    main()
