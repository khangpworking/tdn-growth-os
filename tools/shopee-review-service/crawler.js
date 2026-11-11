(async () => {
  const config = window.__shopeeApiConfig;
  if (!config.sampling && config.kind !== 'counts') return await (async () => {

  const LIMIT = window.__shopeeApiConfig.limit;
  const MAX_PAGES = window.__shopeeApiConfig.maxPages;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const root = document.querySelector('.product-ratings');
  if (!root) throw new Error('Open the product ratings section first.');
  const filters = [...root.querySelectorAll('.product-rating-overview__filter')];
  const textFilter = filters.find(e => /with comments|có bình luận/i.test(e.innerText));
  if (!textFilter) throw new Error('The comments filter was not found.');
  const ids = () => [...root.querySelectorAll('[data-cmtid]')].map(e => e.dataset.cmtid).join(',');
  const waitForPage = async oldIds => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (/\/verify\/|\/buyer\/login/.test(location.pathname)) {
        throw new Error('Login or verification is required.');
      }
      const list = root.querySelector('.product-ratings__list');
      if (ids() && ids() !== oldIds && list && getComputedStyle(list).opacity === '1') return;
      await pause(300);
    }
    throw new Error('The next review page did not finish loading.');
  };
  if (!textFilter.classList.contains('product-rating-overview__filter--active')) {
    const previous = ids();
    textFilter.click();
    await pause(3500);
    if (ids() !== previous) await waitForPage(previous);
    if (!textFilter.classList.contains('product-rating-overview__filter--active')) {
      throw new Error('The comments filter did not activate.');
    }
  }
  const firstPage = [...root.querySelectorAll('.shopee-page-controller button')].find(e => e.innerText.trim() === '1');
  const activePage = root.querySelector('.shopee-page-controller .shopee-button-solid--primary')?.innerText.trim();
  if (activePage !== '1') {
    if (!firstPage) throw new Error('Return to review page 1 before running this script.');
    const previous = ids();
    await pause(3000 + Math.random() * 2000);
    firstPage.click();
    await waitForPage(previous);
  }
  const expected = Number(textFilter.innerText.match(/\((\d+)\)/)?.[1]) || null;
  const records = new Map();
  const visitedPages = new Set();
  const trace = [];
  const excluded = [];
  let stopReason = 'page_limit';
  let error = null;
  const startedAt = new Date().toISOString();
  try {
    for (let step = 0; step < MAX_PAGES; step++) {
      if (window.__shopeeCancel) { stopReason = 'cancelled'; break; }
      const controller = root.querySelector('.shopee-page-controller');
      const pageNumber = Number(controller?.querySelector('.shopee-button-solid--primary')?.innerText) || 1;
      const signature = ids();
      if (!signature) throw new Error('No review cards are visible.');
      if (visitedPages.has(signature)) { stopReason = 'repeated_page'; break; }
      visitedPages.add(signature);
      const cards = [...root.querySelectorAll('[data-cmtid]')];
      for (const card of cards) {
        const id = card.dataset.cmtid;
        const body = card.querySelector('.meQyXP');
        if (!body) {
          const remaining = card.querySelector('.A7MThp')?.cloneNode(true);
          remaining?.querySelectorAll('.d72He7,.ZBCPg1,.p5tg3L,.jpKEtU').forEach(e => e.remove());
          if (remaining?.textContent.trim()) throw new Error(`The review body selector changed for ${id}.`);
          excluded.push({review_id: id, reason: 'empty_or_media_only'});
          continue;
        }
        const reviewText = body.innerText.trim();
        if (!/[\p{L}\p{N}]/u.test(reviewText)) {
          excluded.push({review_id: id, reason: 'empty_or_symbols_only'});
          continue;
        }
        const metadata = card.querySelector('.XYk98l')?.innerText.trim() || '';
        const [postedAt, ...variation] = metadata.split(/\s*\|\s*(?:Variation|Phân loại hàng):\s*/i);
        const attributes = [...(body.firstElementChild?.children || [])].map(e => e.innerText.trim()).filter(Boolean);
        const comment = body.querySelector('.YNedDV')?.innerText.trim() || '';
        const rating = card.querySelectorAll('.rGdC5O svg.YBGCRA.icon-rating-solid').length;
        records.set(id, {
          review_id: id,
          author: card.querySelector('.InK5kS')?.innerText.trim() || '',
          posted_at_local: postedAt,
          variation: variation.join(' | '),
          stars: rating || null,
          comment,
          attributes,
          review_text: reviewText,
          content_type: comment ? 'comment' : 'attributes_only',
          media_urls: [...new Set([...card.querySelectorAll('.rating-media-list__image-wrapper img')].map(e => e.getAttribute('src')).filter(Boolean))],
          page: pageNumber,
          source_url: window.__shopeeApiConfig.url,
        });
        if (records.size >= LIMIT) break;
      }
      trace.push({page: pageNumber, cards: cards.length, collected: records.size, ids: cards.map(e => e.dataset.cmtid)});
      window.__shopeeDomProgress = {page: pageNumber, collected: records.size};
      window.__shopeeDomSnapshot = {records: [...records.values()], excluded: [...excluded], pages: [...trace]};
      if (records.size >= LIMIT) { stopReason = 'record_limit'; break; }
      if (expected && records.size + excluded.length >= expected) { stopReason = 'expected_count_reached'; break; }
      const next = controller?.querySelector('.shopee-icon-button--right');
      if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true' || next.classList.contains('shopee-icon-button--disabled')) {
        stopReason = 'last_page'; break;
      }
      await pause(3000 + Math.random() * 2000);
      next.scrollIntoView({block: 'center'});
      next.click();
      await waitForPage(signature);
    }
  } catch (exc) {
    stopReason = 'error';
    error = String(exc);
  }
  return {
    kind: 'shopee_dom_crawl',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    product_url: window.__shopeeApiConfig.url,
    product_title: document.querySelector('h1')?.innerText.trim(),
    filter: textFilter.innerText,
    expected_with_comments: expected,
    rating_filters: filters.map(e => e.innerText),
    stop_reason: stopReason,
    error,
    excluded,
    pages: trace,
    records: [...records.values()],
  };

  })();
  const policy = config.sampling?.policy;
  const deadline = Math.min(config.deadlineAt, Date.now() + 30 * 60_000);
  const normalize = value => String(value).normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
  const visible = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const failure = code => { throw new Error(code); };
  const check = () => {
    if (window.__shopeeCancel) failure('CANCELLED');
    if (Date.now() >= deadline) failure('TIMEOUT');
    if (/\/verify\/|\/buyer\/login/.test(location.pathname)) failure('HUMAN_REQUIRED');
  };
  const pause = async ms => { const end = Date.now() + ms; while (Date.now() < end) { check(); await new Promise(resolve => setTimeout(resolve, Math.min(250, end - Date.now()))); } };
  const roots = [...document.querySelectorAll('.product-ratings')].filter(visible);
  if (roots.length !== 1) failure('CONTROL_CHANGED');
  const root = roots[0];
  // Exact native filter labels only. Counts are separate from label identity.
  const classify = element => {
    const label = normalize(element.innerText);
    const parsed = /^(.*?)\s*\(([^()]*)\)$/.exec(label);
    const name = (parsed ? parsed[1] : label).trim();
    let key = null;
    if (['all', 'tất cả'].includes(name)) key = 'all';
    else if (['with comments', 'có bình luận'].includes(name)) key = 'with-comments';
    else { const star = /^([1-5]) (?:sao|stars?)$/.exec(name); if (star) key = star[1]; }
    if (!key) return null;
    let count = {status: 'missing', value: null};
    if (parsed) {
      const value = parsed[2].trim();
      // Grouping is accepted only in complete groups of three; no abbreviated counts.
      const exact = /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(value);
      const number = exact ? Number(value.replace(/[,.]/g, '')) : NaN;
      count = Number.isSafeInteger(number) && number >= 0 ? {status: 'observed', value: number} : {status: 'ambiguous', value: null};
    }
    return {key, count, element};
  };
  const controls = () => [...root.querySelectorAll('.product-rating-overview__filter')].filter(visible).map(classify).filter(Boolean);
  const forKey = key => controls().filter(control => control.key === key);
  const nativeControl = key => { const found = forKey(key); if (found.length !== 1) failure('CONTROL_CHANGED'); return found[0].element; };
  const sourceCount = key => { const found = forKey(key); return found.length === 0 ? {status:'missing',value:null} : found.length === 1 ? found[0].count : {status:'ambiguous',value:null}; };
  const sourceCounts = {stars:Object.fromEntries([1,2,3,4,5].map(star => [String(star), sourceCount(String(star))])), withComments:sourceCount('with-comments')};
  const sourceCountsObservedAt = new Date().toISOString();
  if (config.kind === 'counts') return {kind:'counts', source_counts:sourceCounts, source_counts_observed_at:sourceCountsObservedAt};
  const keys = policy.mode === 'stars' ? policy.stars.map(String) : [policy.mode];
  if (!keys.length || keys.some(key => !['all','with-comments','1','2','3','4','5'].includes(key))) failure('CONTROL_CHANGED');
  keys.forEach(nativeControl); // All requested controls must exist before any filter action.
  const quota = new Map();
  if (policy.allocation === 'equal-stars') {
    const base = Math.floor(policy.totalPerLink / keys.length), remainder = policy.totalPerLink % keys.length;
    keys.forEach((key, index) => quota.set(key, base + (index < remainder ? 1 : 0)));
  }
  const states = keys.map(key => ({key, page:1, done:quota.get(key) === 0, stopReason:quota.get(key) === 0 ? 'quota' : 'not_started', signatures:new Set(), actual:0}));
  const records = new Map(), pages = [];
  const cards = () => [...root.querySelectorAll('[data-cmtid]')].filter(visible);
  const signature = () => cards().map(card => card.dataset.cmtid).join(',');
  const activePage = () => {
    const active = [...root.querySelectorAll('.shopee-page-controller .shopee-button-solid--primary')].filter(visible);
    return active.length === 1 && /^[1-9]\d*$/.test(active[0].innerText.trim()) ? Number(active[0].innerText.trim()) : null;
  };
  const isActive = key => {
    const selected = [...root.querySelectorAll('.product-rating-overview__filter--active')].filter(visible);
    return selected.length === 1 && selected[0] === nativeControl(key);
  };
  const noPagination = () => [...root.querySelectorAll('.shopee-page-controller')].filter(visible).length === 0;
  const observedZero = key => { const count=sourceCount(key); return count.status === 'observed' && count.value === 0; };
  const loadedList = () => { const lists=[...root.querySelectorAll('.product-ratings__list')].filter(visible); return lists.length === 1 && lists.every(list => getComputedStyle(list).opacity === '1' && list.getAttribute('aria-busy') !== 'true'); };
  const verifiedEmpty = key => isActive(key) && observedZero(key) && cards().length === 0 && loadedList() && (noPagination() || activePage() === 1);
  const singlePage = key => { const count=sourceCount(key); return noPagination() && count.status === 'observed' && count.value > 0 && count.value === cards().length; };
  const observeFilterTransition = () => {
    const initialCards = new Set(root.querySelectorAll('[data-cmtid]'));
    const initiallyLoaded = loadedList();
    let loadingSeen = false, freshCardsSeen = false;
    const observe = mutations => {
      const lists = [...root.querySelectorAll('.product-ratings__list')].filter(visible);
      if (lists.length !== 1) return;
      const list = lists[0];
      // The active filter class alone is not evidence that its results loaded.
      if (initiallyLoaded && (getComputedStyle(list).opacity !== '1' || list.getAttribute('aria-busy') === 'true')) loadingSeen = true;
      const listChanged = mutations.some(mutation => mutation.type === 'childList' &&
        (mutation.target === list || list.contains(mutation.target) ||
         [...mutation.addedNodes].some(node => node === list || node.nodeType === 1 && node.contains(list))));
      if (listChanged && [...list.querySelectorAll('[data-cmtid]')].some(card => visible(card) && !initialCards.has(card))) freshCardsSeen = true;
    };
    const observer = new MutationObserver(observe);
    observer.observe(root, {subtree:true,childList:true,attributes:true,attributeFilter:['class','style','aria-busy']});
    return {
      completed: () => { observe(observer.takeRecords()); return loadedList() && (loadingSeen || freshCardsSeen); },
      disconnect: () => observer.disconnect(),
    };
  };
  const settle = async (key, page, old, changed, transition = null) => {
    const end = Math.min(deadline, Date.now() + 20_000);
    while (Date.now() < end) {
      check();
      if (page === 1 && verifiedEmpty(key)) return;
      const ready = loadedList() && cards().length > 0;
      const pageMatches = activePage() === page || page === 1 && singlePage(key);
      if (isActive(key) && pageMatches && ready && (!changed || signature() !== old || transition?.completed())) return;
      await pause(300);
    }
    failure('CONTROL_CHANGED');
  };
  const clickFirst = async key => {
    const buttons=[...root.querySelectorAll('.shopee-page-controller button')].filter(visible).filter(button => button.innerText.trim() === '1');
    if (buttons.length !== 1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') failure('CONTROL_CHANGED');
    const old=signature();buttons[0].click();await pause(3500);await settle(key,1,old,true);
  };
  const openFirst = async state => {
    check();
    if (!isActive(state.key)) {
      const old=signature(),transition=observeFilterTransition();
      try {
        nativeControl(state.key).click();await pause(3500);
        await settle(state.key,1,old,true,transition);
      } finally { transition.disconnect(); }
    }
    if (activePage() !== 1 && !noPagination()) await clickFirst(state.key);
    await settle(state.key,1,'',false);
  };
  const nextControl = () => {
    const buttons=[...root.querySelectorAll('.shopee-page-controller .shopee-icon-button--right')].filter(visible);
    if(buttons.length!==1)failure('CONTROL_CHANGED');return buttons[0];
  };
  const disabled = button => button.disabled || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('shopee-icon-button--disabled');
  const nextPage = async state => {
    const old=signature(),button=nextControl();if(disabled(button))failure('CONTROL_CHANGED');
    button.click();await pause(3500);await settle(state.key,state.page,old,true);
  };
  const meaningful = value => /[\p{L}\p{N}]/u.test(value);
  const extract = (card, state) => {
    const id = card.dataset.cmtid;
    if (!id || id.length > 2000) failure('CONTROL_CHANGED');
    const rating = card.querySelectorAll('.rGdC5O svg.YBGCRA.icon-rating-solid').length;
    // Validate the entire native star page, including textless cards, before admission.
    if (policy.mode === 'stars' && rating !== Number(state.key)) failure('CONTROL_CHANGED');
    const body = card.querySelector('.meQyXP');
    if (!body) {
      const remaining = card.querySelector('.A7MThp')?.cloneNode(true);
      remaining?.querySelectorAll('.d72He7,.ZBCPg1,.p5tg3L,.jpKEtU').forEach(element => element.remove());
      if (remaining?.textContent.trim()) failure('CONTROL_CHANGED');
      return null;
    }
    const comment = body.querySelector('.YNedDV')?.innerText.trim() || '';
    const attributes = [...(body.firstElementChild?.children || [])].filter(element => !element.matches('.YNedDV') && !element.querySelector('.YNedDV')).map(element => element.innerText.trim()).filter(Boolean);
    if (![comment, ...attributes].some(meaningful)) {
      if (meaningful(body.innerText) && !comment && !attributes.length) failure('CONTROL_CHANGED');
      return null;
    }
    const metadata = card.querySelector('.XYk98l')?.innerText.trim() || '';
    const [postedAt, ...variation] = metadata.split(/\s*\|\s*(?:Variation|Phân loại hàng):\s*/i);
    return {review_id:id,posted_at_local:postedAt,variation:variation.join(' | '),stars:rating || null,comment,attributes,content_type:comment ? 'comment' : 'attributes_only',page:state.page,source_url:config.url,source_filter:state.key};
  };
  const publish = () => {
    window.__shopeeDomProgress = {page:pages.at(-1)?.page || 0,collected:records.size};
    window.__shopeeDomSnapshot = {records:[...records.values()],pages:[...pages],groups:states.map(({key,stopReason}) => ({filter:key,stopReason})),source_counts:sourceCounts,source_counts_observed_at:sourceCountsObservedAt,sampling:config.sampling,stop_reason:'running'};
  };
  let stopReason = 'exhausted';
  try {
    for (const state of states) {
      if (records.size >= policy.totalPerLink) break;
      if (state.done) continue;
      await openFirst(state);
      while (!state.done && records.size < policy.totalPerLink) {
        check();
        if (pages.length >= Math.min(config.maxPages,500)) { stopReason='page_limit';break; }
        if (!isActive(state.key)) failure('CONTROL_CHANGED');
        const current=cards(),ids=signature();
        if (!current.length && !verifiedEmpty(state.key)) failure('CONTROL_CHANGED');
        if (state.signatures.has(ids)) failure('CONTROL_CHANGED');
        state.signatures.add(ids);
        // Validate every visible rating before retaining any candidate from this page.
        const extracted=current.map(card => extract(card,state));
        for (const row of extracted) {
          if (!row || records.has(row.review_id)) continue;
          if (records.size >= policy.totalPerLink || quota.has(state.key) && state.actual >= quota.get(state.key)) break;
          records.set(row.review_id,row);state.actual++;
        }
        pages.push({filter:state.key,page:state.page,cards:current.length,collected:records.size,ids:current.map(card => card.dataset.cmtid)});
        if (quota.has(state.key) && state.actual >= quota.get(state.key)) {state.done=true;state.stopReason='quota';}
        else if (!current.length || singlePage(state.key)) {state.done=true;state.stopReason='exhausted';}
        else if (disabled(nextControl())) {state.done=true;state.stopReason='exhausted';}
        publish();
        if (state.done || records.size >= policy.totalPerLink) break;
        if (pages.length >= Math.min(config.maxPages,500)) {stopReason='page_limit';break;}
        state.page++;
        await nextPage(state);
      }
      if (stopReason === 'page_limit') break;
    }
    if (records.size === policy.totalPerLink) stopReason='record_limit';
  } catch (error) {
    stopReason = error.message === 'CANCELLED' ? 'cancelled' : error.message === 'TIMEOUT' ? 'timeout' : 'control_changed';
  }
  for (const state of states.filter(state => !state.done)) state.stopReason = stopReason === 'record_limit' ? 'total_limit' : stopReason;
  publish();
  return {product_url:config.url,...window.__shopeeDomSnapshot,stop_reason:stopReason,error:['control_changed','timeout'].includes(stopReason) ? stopReason.toUpperCase() : null};
})();
