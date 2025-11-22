// Minimal search UI with pagination for /search (hybrid + paper only)
(function () {
  const apiBaseInput = document.getElementById('api-base');
  const apiKeyInput = document.getElementById('api-key');
  const queryInput = document.getElementById('query');
  const yearFromInput = document.getElementById('year-from');
  const yearToInput = document.getElementById('year-to');
  const subjectInput = document.getElementById('subject');
  const sourceInput = document.getElementById('source');
  const filtersPanel = document.getElementById('filters-panel');
  const toggleFiltersBtn = document.getElementById('toggle-filters');
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results-list');
  const summaryEl = document.getElementById('results-summary');
  const searchBtn = document.getElementById('search-btn');
  const paginationEl = document.getElementById('pagination');
  const paginationTopEl = document.getElementById('pagination-top');

  let results = [];
  const pageSize = 8;

  // Defaults
  const inferredBase = window.location.origin.replace(/:8080$/, ':3000');
  apiBaseInput.value = localStorage.getItem('kw_api_base') || inferredBase || 'http://localhost:3000';
  apiKeyInput.value = localStorage.getItem('kw_api_key') || '';

  function setStatus(message, type = 'muted') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  function renderResults() {
    if (!results.length) {
      resultsEl.innerHTML = '<p class="text-muted mb-0">No results yet. Run a search.</p>';
      summaryEl.textContent = '';
      paginationEl.innerHTML = '';
      paginationTopEl.innerHTML = '';
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
      summaryEl.textContent = `Showing ${data.length} of ${results.length} results`;
    };

    const syncPaginations = (from) => {
      const target = from === 'top' ? '#pagination' : '#pagination-top';
      const inst = $(target).data('pagination');
      const sourceInst = from === 'top' ? $('#pagination-top').data('pagination') : $('#pagination').data('pagination');
      if (inst && sourceInst && inst.model.pageNumber !== sourceInst.model.pageNumber) {
        $(target).pagination('go', sourceInst.model.pageNumber);
      }
    };

    $('#pagination-top').pagination({
      dataSource: results,
      pageSize,
      className: 'paginationjs-theme-blue',
      callback: (data) => {
        renderPage(data);
        syncPaginations('top');
      }
    });

    $('#pagination').pagination({
      dataSource: results,
      pageSize,
      className: 'paginationjs-theme-blue',
      callback: (data) => {
        renderPage(data);
        syncPaginations('bottom');
      }
    });
  }

  async function runSearch() {
    const apiBase = apiBaseInput.value.trim() || 'http://localhost:3000';
    const apiKey = apiKeyInput.value.trim();
    const q = queryInput.value.trim();
    if (!q) {
      setStatus('Please enter a query.', 'text-danger');
      return;
    }

    const payload = {
      q,
      mode: 'hybrid',
      level: 'paper',
      limit: 50,
      filters: {}
    };

    const yearFrom = Number(yearFromInput.value);
    const yearTo = Number(yearToInput.value);
    if (yearFrom) payload.filters.yearFrom = yearFrom;
    if (yearTo) payload.filters.yearTo = yearTo;
    if (subjectInput.value) payload.filters.subject = subjectInput.value.trim();
    if (sourceInput.value) payload.filters.source = sourceInput.value.trim();
    if (!Object.keys(payload.filters).length) delete payload.filters;

    setStatus('Searching...', 'muted');
    try {
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
      results = Array.isArray(data.results) ? data.results : [];
      setStatus('', 'muted');
      localStorage.setItem('kw_api_key', apiKey);
      localStorage.setItem('kw_api_base', apiBase);
      renderResults();
    } catch (err) {
      console.error(err);
      setStatus(`Search failed: ${err.message}`, 'error');
      results = [];
      renderResults();
    }
  }

  searchBtn.addEventListener('click', () => runSearch(false));
  toggleFiltersBtn.addEventListener('click', () => {
    filtersPanel.classList.toggle('hidden');
    toggleFiltersBtn.textContent = filtersPanel.classList.contains('hidden') ? 'Filters' : 'Hide filters';
  });

  renderResults();
})();
