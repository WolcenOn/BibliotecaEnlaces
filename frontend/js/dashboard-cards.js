const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function resourceMap() {
  const map = new Map();
  document.querySelectorAll('#resourceList .music-card').forEach(card => {
    const link = card.querySelector('h3 a');
    if (!link) return;
    map.set(link.textContent.trim(), {
      url: link.href,
      title: link.textContent.trim(),
      image: card.querySelector('.cover')?.src || '',
      provider: card.querySelector('.eyebrow')?.textContent.trim() || 'Enlace',
      description: card.querySelector('.music-copy > p:not(.eyebrow)')?.textContent.trim() || '',
      meta: [...card.querySelectorAll('.chip')].map(chip => chip.textContent.trim())
    });
  });
  return map;
}

function cardMarkup(item, position = '') {
  const image = item.image
    ? `<img class="dashboard-card-image" src="${esc(item.image)}" alt="" loading="lazy">`
    : '<div class="dashboard-card-image dashboard-card-placeholder">↗</div>';
  const positionMarkup = position ? `<span class="ranking-position">${position}</span>` : '';
  const classes = position ? 'dashboard-resource-card ranking-resource-card' : 'dashboard-resource-card';
  return `<article class="${classes}">${positionMarkup}${image}<div class="dashboard-card-copy"><p class="eyebrow">${esc(item.provider)}</p><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>${item.description ? `<p class="dashboard-card-description">${esc(item.description)}</p>` : ''}${item.score ? `<p class="ranking-score">${esc(item.score)}</p>` : ''}<div class="meta">${item.meta.map(value => `<span class="chip">${esc(value)}</span>`).join('')}</div><a class="button button-secondary dashboard-open-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir recurso</a></div></article>`;
}

function enhanceRecent() {
  const container = document.querySelector('#recentList');
  if (!container || container.dataset.enhanced === 'true') return;
  const resources = resourceMap();
  const links = [...container.querySelectorAll('a.recent-item')];
  if (!links.length || !resources.size) return;
  const cards = links.map(link => {
    const title = link.querySelector('strong')?.textContent.trim() || '';
    const base = resources.get(title) || {
      url: link.href,
      title,
      image: '',
      provider: 'Recurso reciente',
      description: '',
      meta: [link.querySelector('p')?.textContent.trim(), link.querySelector('small')?.textContent.trim()].filter(Boolean)
    };
    return cardMarkup(base);
  });
  container.innerHTML = cards.join('');
  container.dataset.enhanced = 'true';
}

function enhanceRanking() {
  const container = document.querySelector('#rankingList');
  if (!container || container.dataset.enhanced === 'true') return;
  const resources = resourceMap();
  const items = [...container.querySelectorAll('.ranking-item')];
  if (!items.length || !resources.size) return;
  const cards = items.map((item, index) => {
    const title = item.querySelector('strong')?.textContent.trim() || '';
    const base = resources.get(title) || {
      url: '#',
      title,
      image: '',
      provider: 'Valoración',
      description: '',
      meta: []
    };
    base.score = item.querySelector('small')?.textContent.trim() || '';
    return cardMarkup(base, item.querySelector('.ranking-position')?.textContent.trim() || String(index + 1));
  });
  container.innerHTML = cards.join('');
  container.dataset.enhanced = 'true';
}

function resetEnhancementFlags() {
  document.querySelector('#recentList')?.removeAttribute('data-enhanced');
  document.querySelector('#rankingList')?.removeAttribute('data-enhanced');
}

const observer = new MutationObserver(() => {
  resetEnhancementFlags();
  queueMicrotask(() => {
    enhanceRecent();
    enhanceRanking();
  });
});

const resourceList = document.querySelector('#resourceList');
const recentList = document.querySelector('#recentList');
const rankingList = document.querySelector('#rankingList');
if (resourceList) observer.observe(resourceList, { childList: true, subtree: true });
if (recentList) observer.observe(recentList, { childList: true, subtree: true });
if (rankingList) observer.observe(rankingList, { childList: true, subtree: true });

window.addEventListener('load', () => {
  enhanceRecent();
  enhanceRanking();
});

window.addEventListener('unhandledrejection', event => {
  const message = String(event.reason?.message || '');
  if (message.includes('Error HTTP 404') && message.includes('rating')) {
    event.preventDefault();
    alert('La valoración aún no está activa en Railway. El backend debe desplegar las rutas sociales.');
  }
});
