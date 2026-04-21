// Minimal search UI with pagination for /search (hybrid + paper only)
(function () {
  const apiBaseInput = document.getElementById('api-base');
  const apiKeyInput = document.getElementById('api-key');
  const queryInput = document.getElementById('query');
  const statusEl = document.getElementById('status');
  const searchBtn = document.getElementById('search-btn');
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

  function searchCacheKey(apiBase, apiKey, q, limit, level) {
    const bundle = `${apiBase}\n${apiKey}\n${level}\n${String(limit)}\n${q}`;
    let h = 5381;
    for (let i = 0; i < bundle.length; i += 1) {
      h = Math.imul(h, 33) ^ bundle.charCodeAt(i);
    }
    return SEARCH_CACHE_PREFIX + (h >>> 0).toString(16);
  }

  function readSearchCache(apiBase, apiKey, q, limit, level) {
    try {
      const key = searchCacheKey(apiBase, apiKey, q, limit, level);
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

  function writeSearchCache(apiBase, apiKey, q, limit, level, lexical, hybrid) {
    const key = searchCacheKey(apiBase, apiKey, q, limit, level);
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

  // Defaults
  const inferredBase = `${window.location.origin}/api`;
  const apiBaseFromQuery = new URLSearchParams(window.location.search).get('apiBase');
  if (apiBaseFromQuery) {
    apiBaseInput.value = apiBaseFromQuery;
    localStorage.setItem('kw_api_base', apiBaseFromQuery);
  } else {
    apiBaseInput.value = localStorage.getItem('kw_api_base') || inferredBase || 'http://localhost:3000';
  }
  apiKeyInput.value = localStorage.getItem('kw_api_key') || '';

  function setStatus(message, type = 'muted') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
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

  async function fetchSearch(apiBase, apiKey, payload) {
    const res = await fetch(`${apiBase}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {})
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
    const apiBase = apiBaseInput.value.trim() || 'http://localhost:3000';
    const apiKey = apiKeyInput.value.trim();
    const q = queryInput.value.trim();
    if (!q) {
      setStatus('Please enter a query.', 'text-danger');
      return;
    }

    const basePayload = {
      q,
      level: 'paper',
      limit: 50
    };

    const cached = readSearchCache(apiBase, apiKey, q, basePayload.limit, basePayload.level);
    if (cached) {
      resultsLex = cached.lexical;
      resultsHybrid = cached.hybrid;
      setStatus('', 'muted');
      localStorage.setItem('kw_api_key', apiKey);
      localStorage.setItem('kw_api_base', apiBase);
      renderResults();
      return;
    }

    setStatus('Searching…', 'muted');
    setSearchLoading(true);
    showResultsSkeleton();
    try {
      const [lex, hybrid] = await Promise.all([
        fetchSearch(apiBase, apiKey, { ...basePayload, mode: 'lexical' }),
        fetchSearch(apiBase, apiKey, { ...basePayload, mode: 'hybrid' })
      ]);

      resultsLex = lex;
      resultsHybrid = hybrid;
      setStatus('', 'muted');
      localStorage.setItem('kw_api_key', apiKey);
      localStorage.setItem('kw_api_base', apiBase);
      writeSearchCache(apiBase, apiKey, q, basePayload.limit, basePayload.level, lex, hybrid);
      renderResults();
    } catch (err) {
      console.error(err);
      setStatus(`Search failed: ${err.message}`, 'error');
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
