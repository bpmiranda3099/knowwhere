// Minimal search UI with pagination for /search (hybrid + paper only)
(function () {
  const queryInput = document.getElementById('query');
  const searchBtn = document.getElementById('search-btn');
  const TOAST_AUTO_MS = 8000;
  const contentPageEl = document.body;

  const panels = {
    lex: {
      resultsEl: document.getElementById('results-list-lex'),
      summaryEl: document.getElementById('results-summary-lex'),
      paginationTopSelector: '#pagination-top-lex',
      paginationBottomSelector: '#pagination-lex'
    },
    hybrid: {
      resultsEl: document.getElementById('results-list-hybrid'),
      summaryEl: document.getElementById('results-summary-hybrid'),
      paginationTopSelector: '#pagination-top-hybrid',
      paginationBottomSelector: '#pagination-hybrid'
    }
  };

  let resultsLex = [];
  let resultsHybrid = [];
  const pageSize = 6;
  const skeletonCardCount = 4;

  /** Same query + API + limit + level → reuse last successful Standard + KnowWhere responses. */
  const SEARCH_CACHE_PREFIX = 'kw_search_pair:v1:';
  const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  function searchCacheKey(apiBase, q, limit, level) {
    const bundle = `${apiBase}\n${level}\n${String(limit)}\n${q}`;
    let h = 5381;
    for (let i = 0; i < bundle.length; i += 1) {
      h = Math.imul(h, 33) ^ bundle.charCodeAt(i);
    }
    return SEARCH_CACHE_PREFIX + (h >>> 0).toString(16);
  }

  function readSearchCache(apiBase, q, limit, level) {
    try {
      const key = searchCacheKey(apiBase, q, limit, level);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed.t !== 'number' ||
        !Array.isArray(parsed.lexical) ||
        !Array.isArray(parsed.hybrid)
      ) {
        localStorage.removeItem(key);
        return null;
      }
      if (Date.now() - parsed.t > SEARCH_CACHE_TTL_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return { lexical: parsed.lexical, hybrid: parsed.hybrid };
    } catch {
      return null;
    }
  }

  function clearSearchCacheEntries() {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SEARCH_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  }

  function writeSearchCache(apiBase, q, limit, level, lexical, hybrid) {
    const key = searchCacheKey(apiBase, q, limit, level);
    const payload = JSON.stringify({ t: Date.now(), lexical, hybrid });
    try {
      localStorage.setItem(key, payload);
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        clearSearchCacheEntries();
        try {
          localStorage.setItem(key, payload);
        } catch (_) {
          // ignore if still full
        }
      }
    }
  }

  function skeletonCardHtml() {
    return `
      <div class="card result-card result-card--skeleton" aria-hidden="true">
        <div class="card__content">
          <div class="skeleton skeleton--title"></div>
          <div class="skeleton skeleton--meta"></div>
          <div class="skeleton skeleton--line"></div>
          <div class="skeleton skeleton--line skeleton--medium"></div>
          <div class="skeleton skeleton--line skeleton--short"></div>
        </div>
      </div>`;
  }

  function fillSkeletonGrid(resultsEl) {
    const parts = [];
    for (let i = 0; i < skeletonCardCount; i += 1) parts.push(skeletonCardHtml());
    resultsEl.innerHTML = parts.join('');
  }

  function emptyResultsHtml(resultsEl) {
    const variant = resultsEl.id === 'results-list-lex' ? 'lex' : 'hybrid';
    return `
      <div class="results-empty-state results-empty-state--${variant}" role="status">
        <div class="results-empty-state__figure" aria-hidden="true">
          <svg class="results-empty-state__glass" viewBox="0 0 120 120" focusable="false">
            <circle cx="46" cy="46" r="30" fill="none" stroke="currentColor" stroke-width="4" opacity="0.88"/>
            <line x1="68" y1="68" x2="102" y2="102" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" opacity="0.88"/>
          </svg>
        </div>
        <p class="results-empty-state__title">No results found</p>
        <p class="results-empty-state__hint">Try different words: use shorter phrases, synonyms.</p>
      </div>`;
  }

  function setSearchLoading(isLoading) {
    document.body.classList.toggle('search-loading', isLoading);
    searchBtn.disabled = isLoading;
    searchBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    const colLex = panels.lex.resultsEl.closest('.results-column');
    const colHyb = panels.hybrid.resultsEl.closest('.results-column');
    if (colLex) colLex.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (colHyb) colHyb.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  function showResultsSkeleton() {
    destroyPagination(panels.lex.paginationTopSelector, panels.lex.paginationBottomSelector);
    destroyPagination(panels.hybrid.paginationTopSelector, panels.hybrid.paginationBottomSelector);
    $(panels.lex.paginationTopSelector).empty();
    $(panels.lex.paginationBottomSelector).empty();
    $(panels.hybrid.paginationTopSelector).empty();
    $(panels.hybrid.paginationBottomSelector).empty();
    panels.lex.summaryEl.textContent = '';
    panels.hybrid.summaryEl.textContent = '';
    fillSkeletonGrid(panels.lex.resultsEl);
    fillSkeletonGrid(panels.hybrid.resultsEl);
  }

  // Stage-aware defaults:
  // - local: use the nginx reverse-proxied API when served from the web container (/api/* → api:3000/*)
  // - demo: use a deployed API base (intended for GitHub Pages)
  const params = new URLSearchParams(window.location.search);
  const apiBaseFromQuery = params.get('apiBase')?.trim();
  const stageFromQuery = params.get('stage')?.trim();
  const inferredStage =
    stageFromQuery ||
    localStorage.getItem('kw_stage') ||
    (window.location.hostname.endsWith('github.io') ? 'demo' : 'local');

  const stage = inferredStage === 'demo' ? 'demo' : 'local';
  localStorage.setItem('kw_stage', stage);

  const inferredLocalBase = `${window.location.origin}/api`;
  const configuredDemoBase = localStorage.getItem('kw_demo_api_base') || 'https://140.245.125.172.nip.io';

  const inferredApiBase = (
    apiBaseFromQuery ||
    (stage === 'demo' ? configuredDemoBase : (localStorage.getItem('kw_api_base') || inferredLocalBase)) ||
    ''
  ).replace(/\/+$/, '');
  if (inferredApiBase) {
    localStorage.setItem(stage === 'demo' ? 'kw_demo_api_base' : 'kw_api_base', inferredApiBase);
  }

  function showToast(message, variant = 'error') {
    const host = document.getElementById('kw-toast-host');
    if (!host || !message) return;
    const el = document.createElement('div');
    el.className = `kw-toast kw-toast--${variant}`;
    el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    el.setAttribute('tabindex', '0');
    el.textContent = message;
    let timer = setTimeout(() => {
      el.remove();
    }, TOAST_AUTO_MS);
    const dismiss = () => {
      clearTimeout(timer);
      el.remove();
    };
    el.addEventListener('click', dismiss);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismiss();
      }
    });
    host.appendChild(el);
  }

  /**
   * Map thrown errors and HTTP responses to a short, non-technical message.
   * @param {unknown} err
   */
  function userMessageForSearchError(err) {
    const raw = err instanceof Error ? err.message : String(err);
    const t = raw.toLowerCase();
    if (t.includes('typeerror: failed to fetch') || t === 'failed to fetch' || t.includes('load failed')) {
      return "We couldn’t connect to the search service. Check that it’s running and try again. If the problem continues, ask your team to check the address this page uses for search.";
    }
    if (t.includes('cors') || t.includes('access control')) {
      return "The browser blocked this request for security settings. Your team may need to allow this website to talk to the search service, or the service may be down.";
    }
    if (t.includes(' 401') || t.includes('unauthorized')) {
      return "Search isn’t available without permission. If your project uses a key, it needs to be set up the way your team described.";
    }
    if (t.includes(' 403') || t.includes('forbidden')) {
      return "You don’t have access to run this search. Check with the person who gave you the link.";
    }
    if (t.includes(' 404') || t.includes('not found')) {
      return "The search service wasn’t found at the address in use. Check that the address is correct, then try again.";
    }
    if (t.includes(' 400') || t.includes('bad request') || t.includes('validation')) {
      return "This search can’t be run with what was entered. Try a shorter question or fewer words.";
    }
    if (
      t.includes(' 500') ||
      t.includes(' 502') ||
      t.includes(' 503') ||
      t.includes('internal server error') ||
      t.includes('fetch failed')
    ) {
      return "The search service is busy or didn’t finish the request. Wait a few seconds and try again.";
    }
    return "Search didn’t complete. Please try again in a moment. If it keeps happening, let your team know.";
  }

  function leaveEmptyState() {
    contentPageEl?.classList.remove('content-page--search-empty');
  }

  function destroyPagination(topSelector, bottomSelector) {
    // If pagination widgets were initialized previously, destroy them so they don't re-render stale data.
    try {
      const topInst = $(topSelector).data('pagination');
      if (topInst) $(topSelector).pagination('destroy');
    } catch (e) {
      // non-fatal
    }
    try {
      const bottomInst = $(bottomSelector).data('pagination');
      if (bottomInst) $(bottomSelector).pagination('destroy');
    } catch (e) {
      // non-fatal
    }
  }

  function renderPanel(panel, allResults) {
    const { resultsEl, summaryEl, paginationTopSelector, paginationBottomSelector } = panel;

    if (!Array.isArray(allResults) || allResults.length === 0) {
      destroyPagination(paginationTopSelector, paginationBottomSelector);
      resultsEl.innerHTML = emptyResultsHtml(resultsEl);
      summaryEl.textContent = '';
      $(paginationTopSelector).empty();
      $(paginationBottomSelector).empty();
      return;
    }

    const renderPage = (data) => {
      resultsEl.innerHTML = '';
      data.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'card result-card';
        const authors = Array.isArray(item.authors) ? item.authors.join(', ') : 'Not provided';
        const rawAbstract = item.abstract || item.snippet || 'No abstract available.';
        const abstractWords = rawAbstract.split(/\s+/).filter(Boolean);
        const abstract =
          abstractWords.length > 100
            ? `${abstractWords.slice(0, 100).join(' ')} ...`
            : rawAbstract;
        const submitted = item.year || item.published || 'Not provided';
        const link = item.url || (item.doi ? `https://doi.org/${item.doi}` : null);
        card.innerHTML = `
          <div class="card__content">
            <div class="result-title">${item.title || '(untitled)'}</div>
            <div class="result-meta">
              ${item.source || 'unknown'}${item.subjects?.length ? ' · ' + item.subjects.join(', ') : ''}
            </div>
            <p class="result-line"><strong>Author:</strong> ${authors}</p>
            <p class="result-line abstract"><strong>Abstract:</strong> ${abstract}</p>
            <p class="result-line"><strong>Submitted:</strong> ${submitted}</p>
            <p class="result-line"><strong>Link:</strong> ${link ? `<a href="${link}" target="_blank" rel="noopener">${link}</a>` : 'Not provided'}</p>
          </div>
        `;
        resultsEl.appendChild(card);
      });
      summaryEl.textContent = `Showing ${data.length} of ${allResults.length} results`;
    };

    const syncPaginations = (from) => {
      const target = from === 'top' ? paginationBottomSelector : paginationTopSelector;
      const inst = $(target).data('pagination');
      const sourceInst =
        from === 'top' ? $(paginationTopSelector).data('pagination') : $(paginationBottomSelector).data('pagination');
      if (inst && sourceInst && inst.model.pageNumber !== sourceInst.model.pageNumber) {
        $(target).pagination('go', sourceInst.model.pageNumber);
      }
    };

    $(paginationTopSelector).pagination({
      dataSource: allResults,
      pageSize,
      className: 'paginationjs-theme-blue',
      showNavigator: false,
      showGoInput: false,
      showGoButton: false,
      prevText: '‹',
      nextText: '›',
      callback: (data) => {
        renderPage(data);
        syncPaginations('top');
      }
    });

    $(paginationBottomSelector).pagination({
      dataSource: allResults,
      pageSize,
      className: 'paginationjs-theme-blue',
      showNavigator: false,
      showGoInput: false,
      showGoButton: false,
      prevText: '‹',
      nextText: '›',
      callback: (data) => {
        renderPage(data);
        syncPaginations('bottom');
      }
    });
  }

  function renderResults() {
    renderPanel(panels.lex, resultsLex);
    renderPanel(panels.hybrid, resultsHybrid);
  }

  async function fetchSearch(apiBase, payload) {
    const res = await fetch(`${apiBase}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  async function runSearch() {
    leaveEmptyState();
    const apiBase =
      (apiBaseFromQuery && apiBaseFromQuery.replace(/\/+$/, '')) ||
      (stage === 'demo'
        ? ((localStorage.getItem('kw_demo_api_base') || configuredDemoBase || '').replace(/\/+$/, ''))
        : ((localStorage.getItem('kw_api_base') || inferredLocalBase || '').replace(/\/+$/, '')));
    const q = queryInput.value.trim();
    if (!q) {
      showToast('Enter a few words in the search box, then try again.', 'info');
      return;
    }
    if (!apiBase) {
      if (stage === 'demo') {
        showToast(
          'This demo needs an API base. Open this page with ?stage=demo&apiBase=https://<your-proxy-host> and try again.',
          'error'
        );
        return;
      }
      showToast('Set the API base, then try again.', 'error');
      return;
    }

    const basePayload = {
      q,
      level: 'paper',
      limit: 50
    };

    const cached = readSearchCache(apiBase, q, basePayload.limit, basePayload.level);
    if (cached) {
      resultsLex = cached.lexical;
      resultsHybrid = cached.hybrid;
      localStorage.setItem('kw_api_base', apiBase);
      renderResults();
      return;
    }

    setSearchLoading(true);
    showResultsSkeleton();
    try {
      const [lex, hybrid] = await Promise.all([
        fetchSearch(apiBase, { ...basePayload, mode: 'lexical' }),
        fetchSearch(apiBase, { ...basePayload, mode: 'hybrid' })
      ]);

      resultsLex = lex;
      resultsHybrid = hybrid;
      localStorage.setItem('kw_api_base', apiBase);
      writeSearchCache(apiBase, q, basePayload.limit, basePayload.level, lex, hybrid);
      renderResults();
    } catch (err) {
      console.error(err);
      showToast(userMessageForSearchError(err), 'error');
      resultsLex = [];
      resultsHybrid = [];
      renderResults();
    } finally {
      setSearchLoading(false);
    }
  }

  searchBtn.addEventListener('click', () => runSearch());
  queryInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  renderResults();
})();
