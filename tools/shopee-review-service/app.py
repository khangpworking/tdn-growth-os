import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Literal

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('APP_DATA_DIR', Path.home() / '.local/state/tdn-shopee-review-service'))
DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
TOKEN = os.environ.get('SHOPEE_API_TOKEN', '')
if len(TOKEN) < 32:
    raise RuntimeError('SHOPEE_API_TOKEN must contain at least 32 characters.')
os.environ.setdefault('CLOAKBROWSER_CACHE_DIR', str(DATA / 'browser-cache'))
os.environ.setdefault('CLOAKBROWSER_AUTO_UPDATE', 'false')
DEFAULT_PRODUCT = os.environ.get('SHOPEE_SESSION_CHECK_URL', 'https://shopee.vn/')
TERMINAL = {'succeeded', 'partial', 'failed', 'cancelled', 'interrupted'}
WAITING = {'needs_login', 'needs_verification'}
bearer = HTTPBearer(auto_error=False)


def now():
    return datetime.now(timezone.utc).isoformat()


def sampling_readonly():
    state = Path(os.environ.get('SHOPEE_FLOW_STATE', Path.home() / '.local/state/tdn-growth-os'))
    return os.environ.get('TDN_SHOPEE_FLOW_READONLY') == '1' or (state / 'shopee-flow/READONLY').exists()


def canonical_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or parsed.hostname not in {'shopee.vn', 'www.shopee.vn'} or parsed.username or parsed.password:
        raise ValueError('Use a full https://shopee.vn product URL.')
    if parsed.port not in (None, 443):
        raise ValueError('Custom ports are not allowed.')
    path = parsed.path.rstrip('/')
    match = re.fullmatch(r'/product/(\d+)/(\d+)', path) or re.search(r'-i\.(\d+)\.(\d+)$', path)
    if not match:
        raise ValueError('Expected /product/shop_id/item_id or a product slug ending in -i.shop_id.item_id.')
    return f'https://shopee.vn/product/{match[1]}/{match[2]}'


class ReviewPolicy(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    format: Literal['shopee-review-policy-v1']
    mode: Literal['all', 'with-comments', 'stars']
    stars: list[int]
    totalPerLink: int = Field(ge=1, le=2000)
    allocation: Literal['pooled', 'equal-stars']
    textRule: Literal['comment-or-attributes-v1']
    order: Literal['native-filter-ascending-stars-v1']

    @model_validator(mode='after')
    def validate_policy(self):
        if self.mode == 'stars':
            if not self.stars or self.stars != sorted(set(self.stars)) or any(type(v) is not int or not 1 <= v <= 5 for v in self.stars):
                raise ValueError('INVALID_SAMPLING_POLICY')
        elif self.stars or self.allocation != 'pooled':
            raise ValueError('INVALID_SAMPLING_POLICY')
        return self


class ReviewPagesPolicy(BaseModel):
    """Pages mode: stop each link after pagesPerLink review pages; totalPerLink is the 2000 safety cap."""
    model_config = ConfigDict(extra='forbid', strict=True)
    format: Literal['shopee-review-policy-v2']
    limitBy: Literal['pages']
    mode: Literal['all', 'with-comments', 'stars']
    stars: list[int]
    pagesPerLink: int = Field(ge=1, le=100)
    totalPerLink: Literal[2000]
    allocation: Literal['pooled']
    textRule: Literal['comment-or-attributes-v1']
    order: Literal['native-filter-ascending-stars-v1']

    @model_validator(mode='after')
    def validate_policy(self):
        if self.mode == 'stars':
            if not self.stars or self.stars != sorted(set(self.stars)) or any(type(v) is not int or not 1 <= v <= 5 for v in self.stars):
                raise ValueError('INVALID_SAMPLING_POLICY')
        elif self.stars:
            raise ValueError('INVALID_SAMPLING_POLICY')
        return self


class SamplingBinding(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    attemptId: str = Field(pattern=r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')
    planSha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    policySha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    policy: ReviewPolicy | ReviewPagesPolicy = Field(discriminator='format')

    @model_validator(mode='after')
    def validate_digest(self):
        value = json.dumps(self.policy.model_dump(), sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        if hashlib.sha256(value.encode()).hexdigest() != self.policySha256:
            raise ValueError('INVALID_SAMPLING_DIGEST')
        return self


class JobInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url: str
    max_comments: int = Field(default=100, ge=1, le=2000, strict=True)
    # Optional page limit; missing means the original 500-page crawl.
    max_pages: int | None = Field(default=None, ge=1, le=500, strict=True)
    sampling: SamplingBinding | None = None

    @field_validator('url')
    @classmethod
    def validate_url(cls, value):
        return canonical_url(value)

    @model_validator(mode='after')
    def validate_cap(self):
        if self.sampling and self.sampling.policy.totalPerLink != self.max_comments:
            raise ValueError('INVALID_SAMPLING_CAP')
        if self.sampling and self.max_pages != getattr(self.sampling.policy, 'pagesPerLink', None):
            raise ValueError('INVALID_SAMPLING_PAGES')
        return self


class CountsInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    kind: Literal['counts'] = 'counts'
    url: str
    request_key: str = Field(pattern=r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')

    @field_validator('url')
    @classmethod
    def validate_url(cls, value):
        return canonical_url(value)


def max_pages(request):
    return request.get('max_pages', 500)


def crawl_state(request, result):
    """Job state for a finished crawl; None means a crawl error the worker classifies."""
    stopped = result.get('stop_reason')
    if stopped == 'cancelled':
        return 'cancelled'
    if result.get('error'):
        return None
    # Reaching an asked page limit is the requested outcome; the default 500-page stop stays partial.
    if stopped in {'record_limit', 'expected_count_reached', 'last_page', 'exhausted'} or stopped == 'page_limit' and max_pages(request) < 500:
        return 'succeeded'
    return 'partial'


def db():
    connection = sqlite3.connect(DATA / 'jobs.sqlite3', timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db():
    with db() as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT, updated_at TEXT, collected INTEGER DEFAULT 0, page INTEGER DEFAULT 0, cancel_requested INTEGER DEFAULT 0, error TEXT)')
        connection.execute("UPDATE jobs SET state='interrupted', error='Service restarted during this job.', updated_at=? WHERE state='running'", (now(),))


def get_job(job_id):
    with db() as connection:
        row = connection.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Job not found.')
    value = dict(row)
    value['request'] = json.loads(value.pop('payload'))
    value['cancel_requested'] = bool(value['cancel_requested'])
    value['result_available'] = (DATA / 'results' / f'{job_id}.json').exists()
    return value


def update_job(job_id, **values):
    allowed = {'state', 'collected', 'page', 'cancel_requested', 'error'}
    if not set(values) <= allowed:
        raise ValueError('Invalid update fields.')
    values['updated_at'] = now()
    sql = ', '.join(f'{key}=?' for key in values)
    with db() as connection:
        connection.execute(f'UPDATE jobs SET {sql} WHERE id=?', (*values.values(), job_id))


def save_result(job_id, value):
    directory = DATA / 'results'
    directory.mkdir(exist_ok=True, mode=0o700)
    target = directory / f'{job_id}.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.chmod(temporary, 0o600)
    temporary.replace(target)


async def require_access(request: Request, credentials=Security(bearer)):
    header = request.headers.get('authorization', '')
    supplied = ''
    if header.lower().startswith('bearer '):
        supplied = header[7:]
    elif header.lower().startswith('basic '):
        try:
            username, password = base64.b64decode(header[6:], validate=True).decode().split(':', 1)
            if username == 'api':
                supplied = password
        except (ValueError, UnicodeError):
            pass
    origin = request.headers.get('origin')
    if origin and origin not in {str(request.base_url).rstrip('/'), 'http://127.0.0.1:8877', 'http://localhost:8877'}:
        raise HTTPException(403, 'Call this private API from your backend or an SSH tunnel.')
    if not hmac.compare_digest(hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(TOKEN.encode()).digest()):
        raise HTTPException(401, 'Authentication required.', headers={'WWW-Authenticate': 'Basic realm="Shopee private API"'})


class BrowserWorker:
    def __init__(self):
        self.queue = asyncio.Queue(maxsize=20)
        self.context = None
        self.page = None
        self.active_job = None
        self.headless = os.environ.get('APP_HEADLESS', '1') == '1'
        self.status = {'state': 'starting', 'authenticated': None}

    async def ensure_browser(self):
        if self.context is not None:
            try:
                if self.page is not None and not self.page.is_closed():
                    return
            except Exception:
                pass
            try:
                await self.context.close()
            except Exception:
                pass
        from cloakbrowser import launch_persistent_context_async
        self.context = await launch_persistent_context_async(str(DATA / 'profile'), headless=self.headless, locale='en-US')
        self.page = self.context.pages[0] if self.context.pages else await self.context.new_page()
        self.page.set_default_timeout(20000)
        bootstrap = DATA / 'import-session.private.json'
        if bootstrap.exists():
            state = json.loads(bootstrap.read_text(encoding='utf-8'))
            cookies = [c for c in state.get('cookies', []) if c['domain'].lstrip('.') == 'shopee.vn']
            await self.context.add_cookies(cookies)
            origins = [o for o in state.get('origins', []) if o['origin'] == 'https://shopee.vn']
            script = '(() => { const origins = ' + json.dumps(origins) + '; const entry=origins.find(o=>o.origin===location.origin); if(entry) for(const item of entry.localStorage) localStorage.setItem(item.name,item.value); })();'
            await self.context.add_init_script(script=script)
            bootstrap.unlink()
        self.status = {'state': 'ready', 'authenticated': None, 'checked_at': now()}

    async def observe_session(self):
        path = urlsplit(self.page.url).path
        body = (await self.page.locator('body').inner_text())[:1000]
        if '/buyer/login' in path or 'Login Required' in body or 'Log in to continue' in body:
            state = 'needs_login'
        elif '/verify/' in path or re.search(r'captcha|verify you are human|please try again later', body, re.I):
            state = 'needs_verification'
        else:
            state = 'ready'
        self.status = {'state': state, 'authenticated': state == 'ready' and await self.page.locator('h1').count() > 0,
                       'page_path': path, 'checked_at': now()}
        return dict(self.status)

    async def navigate_product(self, url):
        await self.ensure_browser()
        await self.page.goto(url, wait_until='domcontentloaded', timeout=45000)
        await self.page.wait_for_timeout(4500)
        status = await self.observe_session()
        if status['state'] != 'ready':
            return status
        await self.page.evaluate('window.scrollBy(0, innerHeight * 1.5)')
        await self.page.wait_for_timeout(2500)
        return await self.observe_session()

    async def control(self, kind):
        if self.active_job or not self.queue.empty():
            raise HTTPException(409, 'Browser is busy. Wait for the active/queued jobs first.')
        future = asyncio.get_running_loop().create_future()
        self.queue.put_nowait({'kind': kind, 'future': future})
        return await asyncio.wait_for(asyncio.shield(future), timeout=65)

    async def run_job(self, job_id):
        job = get_job(job_id)
        if job['state'] == 'cancelled':
            return
        self.active_job = job_id
        update_job(job_id, state='running', error=None, cancel_requested=0)
        try:
            custom = bool(job['request'].get('sampling')) or job['request'].get('kind') == 'counts'
            if custom and sampling_readonly():
                update_job(job_id, state='cancelled', error='READONLY_ON')
                return
            status = await self.navigate_product(job['request']['url'])
            if get_job(job_id)['cancel_requested']:
                update_job(job_id, state='cancelled')
                return
            if status['state'] in WAITING:
                update_job(job_id, state=status['state'], error='Open the Fedora browser and finish login/verification, then resume this job.')
                return
            await self.page.locator('.product-ratings').wait_for(state='attached', timeout=20000)
            await self.page.locator('.product-ratings').scroll_into_view_if_needed()
            if job['request'].get('kind') != 'counts' and not job['request'].get('sampling'):
                await self.page.locator('.product-ratings [data-cmtid]').first.wait_for(state='attached', timeout=20000)
            if get_job(job_id)['cancel_requested']:
                update_job(job_id, state='cancelled')
                return
            await self.page.evaluate('(config) => { window.__shopeeApiConfig=config; window.__shopeeCancel=false; window.__shopeeDomSnapshot=null; window.__shopeeDomProgress=null; }',
                                     {'url': job['request']['url'], 'limit': job['request'].get('max_comments', 0), 'maxPages': max_pages(job['request']),
                                      'sampling': job['request'].get('sampling'), 'kind': job['request'].get('kind'),
                                      'deadlineAt': int(time.time() * 1000) + (60_000 if job['request'].get('kind') == 'counts' else 1_800_000)})
            task = asyncio.create_task(self.page.evaluate((ROOT / 'crawler.js').read_text(encoding='utf-8')))
            started = time.monotonic()
            previous = None
            while not task.done():
                await asyncio.wait({task}, timeout=2)
                if task.done():
                    break
                current = get_job(job_id)
                if current['cancel_requested'] or (custom and sampling_readonly()) or time.monotonic() - started > (60 if job['request'].get('kind') == 'counts' else 1800):
                    await self.page.evaluate('window.__shopeeCancel=true')
                snapshot = await self.page.evaluate('window.__shopeeDomSnapshot || null')
                if snapshot and snapshot['pages']:
                    last = snapshot['pages'][-1]
                    key = (last['page'], len(snapshot['records']))
                    if key != previous:
                        update_job(job_id, collected=len(snapshot['records']), page=last['page'])
                        save_result(job_id, {'job_id': job_id, 'complete': False, 'product_url': job['request']['url'], **snapshot})
                        previous = key
            result = await task
            if job['request'].get('kind') == 'counts':
                if get_job(job_id)['cancel_requested']:
                    update_job(job_id, state='cancelled')
                    return
                save_result(job_id, {'job_id': job_id, 'product_url': job['request']['url'], 'observed_at': now(), **result})
                update_job(job_id, state='succeeded')
                return
            state = crawl_state(job['request'], result)
            if state is None:
                observed = await self.observe_session()
                state = observed['state'] if observed['state'] in WAITING else 'failed'
            result = {'job_id': job_id, 'complete': state == 'succeeded', 'observed_at': now(), **result}
            save_result(job_id, result)
            update_job(job_id, state=state, collected=len(result['records']), page=result['pages'][-1]['page'] if result['pages'] else 0, error=result.get('error'))
        except Exception as error:
            state = 'failed'
            try:
                observed = await self.observe_session()
                if observed['state'] in WAITING:
                    state = observed['state']
            except Exception:
                self.context = None
            update_job(job_id, state=state, error='SOURCE_ACTION_FAILED' if job['request'].get('sampling') or job['request'].get('kind') == 'counts' else f'{type(error).__name__}: {str(error)[:400]}')
        finally:
            self.active_job = None

    async def run(self):
        try:
            await self.ensure_browser()
        except Exception as error:
            self.status = {'state': 'browser_error', 'authenticated': None, 'error': f'{type(error).__name__}: {str(error)[:300]}'}
        while True:
            item = await self.queue.get()
            try:
                if item['kind'] == 'job':
                    await self.run_job(item['job_id'])
                else:
                    await self.ensure_browser()
                    if item['kind'] in {'login', 'background'}:
                        desired_headless = item['kind'] == 'background'
                        if self.headless != desired_headless:
                            await self.context.close()
                            self.context = None
                            self.headless = desired_headless
                            await self.ensure_browser()
                    if item['kind'] == 'login':
                        await self.page.goto('https://shopee.vn/buyer/login', wait_until='domcontentloaded', timeout=45000)
                        self.status = {'state': 'awaiting_user_login', 'authenticated': None, 'opened_on': 'Fedora desktop', 'checked_at': now()}
                        value = dict(self.status)
                    else:
                        value = await self.navigate_product(DEFAULT_PRODUCT)
                    if not item['future'].done():
                        item['future'].set_result(value)
            except Exception as error:
                if 'future' in item and not item['future'].done():
                    item['future'].set_exception(error)
            finally:
                self.queue.task_done()


worker = BrowserWorker()


@asynccontextmanager
async def lifespan(app):
    initialize_db()
    with db() as connection:
        for row in connection.execute("SELECT id FROM jobs WHERE state='queued' ORDER BY created_at LIMIT 20"):
            worker.queue.put_nowait({'kind': 'job', 'job_id': row['id']})
    task = asyncio.create_task(worker.run())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    if worker.context:
        await worker.context.close()


app = FastAPI(title='Shopee Private API', version='1.0.0', description='Private single-browser job API. Access through an SSH tunnel. Authentication is required for every endpoint.',
              docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan, dependencies=[Depends(require_access)])


@app.get('/health', tags=['service'])
def health():
    return {'status': 'ok', 'browser': worker.status['state'], 'active_job': worker.active_job, 'queued': worker.queue.qsize()}


@app.get('/docs', include_in_schema=False)
def docs():
    return get_swagger_ui_html(openapi_url='/openapi.json', title='Shopee Private API')


@app.get('/openapi.json', include_in_schema=False)
def openapi():
    return JSONResponse(app.openapi())


@app.get('/session', tags=['session'])
def session():
    return {**worker.status, 'active_job': worker.active_job}


@app.post('/session/check', tags=['session'])
async def check_session():
    """Navigate to the MSI test product and check whether this browser can access it."""
    return await worker.control('check')


@app.post('/session/login', tags=['session'])
async def login():
    """Open Shopee login in the visible browser on the Fedora laptop."""
    return await worker.control('login')


@app.post('/session/background', tags=['session'])
async def background_session():
    """Close the visible login window, reopen the saved profile headlessly, and check access."""
    return await worker.control('background')


@app.post('/jobs', status_code=202, tags=['jobs'])
async def create_job(payload: JobInput):
    """Queue a DOM crawl of the With Comments filter, with 3–5 second pagination pauses."""
    if payload.sampling and sampling_readonly():
        raise HTTPException(409, 'READONLY_ON')
    if worker.queue.full():
        raise HTTPException(429, 'Queue is full. Try again later.')
    job_id = str(uuid.uuid4())
    with db() as connection:
        connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                           (job_id, payload.model_dump_json(exclude_none=True), 'queued', now(), now()))
    worker.queue.put_nowait({'kind': 'job', 'job_id': job_id})
    return get_job(job_id)


@app.post('/count-jobs', status_code=202, tags=['jobs'])
async def create_count_job(payload: CountsInput):
    """Explicit count-only work, serialized through the same browser queue."""
    if sampling_readonly():
        raise HTTPException(409, 'READONLY_ON')
    if worker.queue.full():
        raise HTTPException(429, 'QUEUE_FULL')
    job_id = str(uuid.uuid4())
    with db() as connection:
        connection.execute('INSERT INTO jobs (id,payload,state,created_at,updated_at) VALUES (?,?,?,?,?)',
                           (job_id, payload.model_dump_json(), 'queued', now(), now()))
    worker.queue.put_nowait({'kind': 'job', 'job_id': job_id})
    return get_job(job_id)


@app.get('/jobs', tags=['jobs'])
def list_jobs(limit: int = 20):
    with db() as connection:
        rows = connection.execute('SELECT id FROM jobs ORDER BY created_at DESC LIMIT ?', (min(max(limit, 1), 100),)).fetchall()
    return [get_job(row['id']) for row in rows]


@app.get('/jobs/{job_id}', tags=['jobs'])
def job_status(job_id: str):
    return get_job(job_id)


@app.get('/jobs/{job_id}/result', tags=['jobs'])
def job_result(job_id: str):
    job = get_job(job_id)
    if not job['result_available']:
        raise HTTPException(409, 'No result is available yet. Poll job status first.')
    return FileResponse(DATA / 'results' / f'{job["id"]}.json', media_type='application/json', filename=f'shopee-{job["id"]}.json')


@app.post('/jobs/{job_id}/resume', status_code=202, tags=['jobs'])
async def resume_job(job_id: str):
    job = get_job(job_id)
    if job['request'].get('sampling') or job['request'].get('kind') == 'counts':
        raise HTTPException(409, 'EXACT_ATTEMPT_RECONCILIATION_REQUIRED')
    if job['state'] not in WAITING | {'failed', 'partial', 'interrupted', 'cancelled'}:
        raise HTTPException(409, 'This job is not resumable.')
    if worker.queue.full():
        raise HTTPException(429, 'Queue is full.')
    update_job(job_id, state='queued', collected=0, page=0, error=None, cancel_requested=0)
    worker.queue.put_nowait({'kind': 'job', 'job_id': job_id})
    return get_job(job_id)


@app.post('/jobs/{job_id}/cancel', status_code=202, tags=['jobs'])
async def cancel_job(job_id: str):
    job = get_job(job_id)
    if job['state'] in TERMINAL:
        raise HTTPException(409, 'Job is already terminal.')
    update_job(job_id, cancel_requested=1, **({'state': 'cancelled'} if job['state'] != 'running' else {}))
    return get_job(job_id)
