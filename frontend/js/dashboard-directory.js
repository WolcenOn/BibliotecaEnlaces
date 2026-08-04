import { api, setToken } from './api.js';

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const mode = document.body.dataset.directoryMode === 'ranked' ? 'ranked' : 'recent';
const groupSelect = $('#groupSelect');
const memberFilter = $('#memberFilter');
const providerFilter = $('#providerFilter');
const searchInput = $('#search');
const list = $('#directoryList');
const count = $('#directoryCount');
let items = [];

function matches(item) {
  const query = searchInput.value.trim().toLocaleLowerCase('es');
  const member = memberFilter.value;
  const provider = providerFilter.value;
  if (member && item.createdBy !== member) return false;
  if (provider && (item.provider || '') !== provider) return false;
  if (!query) return true;
  return [item.title, item.description, item.provider, item.geminiTags, item.addedBy]
    .some(value => String(value || '').toLocaleLowerCase('es').includes(query));
}

function imageMarkup(item) {
  return item.thumbnailUrl
    ? `<img src="${esc(item.thumbnailUrl)}" alt="" loading="lazy">`
    : '<div class="directory-placeholder">↗</div>';
}

function card(item, index) {
  const ranked = mode === 'ranked';
  const position = ranked ? `<span class="directory-position">${index + 1}</span>` : '';
  const score = ranked ? `<span class="chip">★ ${Number(item.rating || 0).toFixed(1)} · ${Number(item.votes || 0)} votos</span>` : '';
  return `<article class="directory-item ${ranked ? 'directory-ranked' : ''}">
    ${position}${imageMarkup(item)}
    <div class="directory-copy">
      <p class="eyebrow">${esc(item.provider || 'Enlace')} · ${esc(item.resourceType || 'link')}</p>
      <h2><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.url)}</a></h2>
      ${item.description ? `<p>${esc(item.description)}</p>` : ''}
      <div class="directory-meta"><span class="chip">por ${esc(item.addedBy || 'Sin autor')}</span><span class="chip">${new Date(item.createdAt).toLocaleString()}</span>${score}</div>
    </div>
    <a class="button button-secondary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
  </article>`;
}

function render() {
  let visible = items.filter(matches);
  if (mode === 'ranked') {
    visible = visible.filter(item => Number(item.votes || 0) > 0)
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.votes || 0) - Number(a.votes || 0));
  } else {
    visible = visible.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
  }
  count.textContent = mode === 'recent'
    ? `${visible.length} de un máximo de 100 recursos recientes`
    : `${visible.length} recursos valorados`;
  list.innerHTML = visible.length ? visible.map(card).join('') : '<p class="empty-state">No hay resultados para estos filtros.</p>';
}

async function loadGroups() {
  const groups = await api('/api/v1/groups');
  if (!groups.length) throw new Error('No perteneces a ninguna biblioteca activa.');
  groupSelect.innerHTML = groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
  const saved = localStorage.getItem('bibliotecaEnlacesActiveGroup');
  if (saved && groups.some(group => group.id === saved)) groupSelect.value = saved;
}

async function loadDirectory() {
  localStorage.setItem('bibliotecaEnlacesActiveGroup', groupSelect.value);
  const [members, resources] = await Promise.all([
    api(`/api/v1/groups/${groupSelect.value}/members`),
    api(`/api/v1/groups/${groupSelect.value}/resource-dashboard`)
  ]);
  items = Array.isArray(resources) ? resources : [];
  memberFilter.innerHTML = `<option value="">Todos los miembros</option>${members.map(member => `<option value="${esc(member.id)}">${esc(member.displayName)}</option>`).join('')}`;
  const providers = [...new Set(items.map(item => String(item.provider || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  providerFilter.innerHTML = `<option value="">Todos los proveedores</option>${providers.map(provider => `<option value="${esc(provider)}">${esc(provider)}</option>`).join('')}`;
  render();
}

[groupSelect, memberFilter, providerFilter].forEach(control => control.addEventListener('change', () => control === groupSelect ? loadDirectory().catch(showError) : render()));
searchInput.addEventListener('input', render);
$('#logout').addEventListener('click', () => { setToken(''); location.href = './login.html'; });

function showError(error) {
  count.textContent = '';
  list.innerHTML = `<p class="empty-state">${esc(error.message)}</p>`;
}

(async () => {
  try {
    await loadGroups();
    await loadDirectory();
  } catch (error) {
    showError(error);
  }
})();
