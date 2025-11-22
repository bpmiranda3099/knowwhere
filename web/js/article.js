// Displays a selected article using cached search results.
(function () {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const cacheRaw = sessionStorage.getItem('kw_search_cache');
  const cache = cacheRaw ? JSON.parse(cacheRaw) : null;
  const results = cache && Array.isArray(cache.results) ? cache.results : [];
  const record = results.find((r) => r.id === id) || null;

  const titleEl = document.getElementById('article-title');
  const sourceEl = document.getElementById('article-source');
  const abstractEl = document.getElementById('article-abstract');
  const metaEl = document.getElementById('article-meta');
  const linksEl = document.getElementById('article-links');

  if (!record) {
    titleEl.textContent = 'Article not found';
    abstractEl.textContent = 'Return to the search page and pick an item.';
    return;
  }

  titleEl.textContent = record.title || record.id || 'Article';
  sourceEl.textContent = `${record.source || 'unknown source'}${record.chunkId != null ? ` · chunk ${record.chunkId}` : ''}`;
  abstractEl.textContent = record.abstract || record.snippet || 'No abstract available.';

  const meta = [];
  if (record.subjects?.length) meta.push(`<strong>Subjects:</strong> ${record.subjects.join(', ')}`);
  if (record.doi) meta.push(`<strong>DOI:</strong> ${record.doi}`);
  if (record.hybridScore != null) meta.push(`<strong>Hybrid score:</strong> ${record.hybridScore.toFixed(3)}`);
  if (record.lexScore != null) meta.push(`<strong>Lex score:</strong> ${record.lexScore.toFixed(3)}`);
  if (record.semScore != null) meta.push(`<strong>Sem score:</strong> ${record.semScore.toFixed(3)}`);
  metaEl.innerHTML = meta.join(' · ');

  const links = [];
  if (record.url) links.push(`<a href="${record.url}" target="_blank" rel="noopener">Open URL</a>`);
  if (record.doi) links.push(`<a href="https://doi.org/${record.doi}" target="_blank" rel="noopener">Open DOI</a>`);
  linksEl.innerHTML = links.join(' | ');
})();
