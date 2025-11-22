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

  function onViewArticle(item) {
    const cache = { results, selectedId: item.id };
    sessionStorage.setItem('kw_search_cache', JSON.stringify(cache));
    window.location.href = `article.html?id=${encodeURIComponent(item.id)}`;
  }

  function renderResults() {
    if (!results.length) {
      resultsEl.innerHTML = '<p class="text-muted mb-0">No results yet. Run a search.</p>';
      summaryEl.textContent = '';
      paginationEl.innerHTML = '';
      return;
    }

    $('#pagination').pagination({
      dataSource: results,
      pageSize,
      className: 'paginationjs-theme-blue',
      callback: function (data, pagination) {
        resultsEl.innerHTML = '';
        data.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'card result-card';
          card.innerHTML = `
            <div class="card__content">
              <div class="result-header">
                <div>
                  <div class="result-title">${item.title || '(untitled)'}</div>
                  <div class="result-meta">
                    ${item.source || 'unknown'}${item.subjects?.length ? ' · ' + item.subjects.join(', ') : ''}
                  </div>
                </div>
                <button class="btn btn-secondary view-btn">View</button>
              </div>
              <p class="result-snippet">${item.snippet || item.abstract || 'No snippet available.'}</p>
              <div class="score-row">
                ${item.hybridScore != null ? `hybrid: ${item.hybridScore.toFixed(3)}` : ''}
              </div>
            </div>
          `;
          card.querySelector('.view-btn').addEventListener('click', () => onViewArticle(item));
          resultsEl.appendChild(card);
        });
        summaryEl.textContent = `Showing ${data.length} of ${results.length} results`;
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
      setStatus(`Search complete: ${results.length} result(s).`, 'success');
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
