// Shared by v3-capture.js (Playwright page.evaluate) and the Windows desktop app
// (tools/shopee-desktop/tdn_metric_browser.py, CDP Runtime.evaluate). Keep this file
// self-contained: the function is serialised and runs inside the Metric page.
// The desktop app evaluates the source from `export async function requestV3InPage`
// to the end of the file, so the function must stay the last thing in this file.

/** Runs in the logged-in page. No credentials or headers cross the bridge. */
export async function requestV3InPage({ urlPath, requestBody }) {
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  if (document.querySelector('input[type=password]') || /\/login|\/sign-in/.test(location.pathname))
    return { stop: 'CAPTURE_LOGIN_REQUIRED' };
  if (!/^\/v2\/market\/analytics\/(search-basic|insight|products|shops|groups)\/$/.test(urlPath))
    return { stop: 'CAPTURE_REQUEST_SCOPE_MISMATCH' };
  try {
    // Reuse the page's read-only header builder. Do not use its HTTP client:
    // that client's 401 handler clears credentials and reloads the page.
    const script = [...document.scripts].map((s) => s.src).find((src) => {
      const u = new URL(src, location.href);
      return u.origin === location.origin && /^\/metric_nuxt\/[^/]+\.js$/.test(u.pathname);
    });
    if (!script) return { stop: 'CAPTURE_PAGE_SESSION_UNAVAILABLE' };
    const module = await import(script);
    const builders = Object.values(module).filter((value) => typeof value === 'function' &&
      ['X-D-CR', 'PlatformId', 'VisitorId'].every((key) => value.toString().includes(key)));
    if (builders.length !== 1) return { stop: 'CAPTURE_PAGE_SESSION_UNAVAILABLE' };
    const headers = await builders[0]();
    if (!headers.Token) return { stop: 'CAPTURE_LOGIN_REQUIRED' };
    const response = await fetch(`https://apiv4.metric.vn${urlPath}`, {
      method: 'POST', credentials: 'include',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000),
    });
    if (response.status === 401) return { stop: 'CAPTURE_LOGIN_REQUIRED' };
    if (response.status === 403) return { stop: 'CAPTURE_ACCESS_RESTRICTED' };
    const text = await response.text();
    if (text.length > 12000000) return { stop: 'CAPTURE_RESPONSE_LIMIT' };
    let body;
    try { body = JSON.parse(text); } catch { return { stop: 'CAPTURE_PROVIDER_DATA_ERROR' }; }
    if (response.status !== 200 || body?.status !== 'success') return { stop: 'CAPTURE_PROVIDER_DATA_ERROR' };
    return { urlPath, method: 'POST', status: response.status, requestBody, body };
  } catch { return { stop: 'CAPTURE_PAGE_REQUEST_FAILED' }; }
}
