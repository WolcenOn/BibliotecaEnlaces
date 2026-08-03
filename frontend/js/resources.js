import { api, setToken } from './api.js';

const $ = selector => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const groupSelect = $('#groupSelect');
const dynamicFields = $('#dynamicFields');
const dynamicFilters = $('#dynamicFilters');
const resourceList = $('#resourceList');
const addPanel = $('#addPanel');
const formMessage = $('#formMessage');
const editDialog = $('#editDialog');
let fields = [];
let currentItems = [];
let inspection = null;

async function loadGroups() {
  const groups = await api('/api/v1/groups');
  groupSelect.innerHTML = groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  if (!groups.length) throw new Error('No perteneces a ninguna biblioteca activa.');
}

async function loadMembers() {
  const members = await api(`/api/v1/groups/${groupSelect.value}/members`);
  $('#memberFilter').innerHTML = `<option value="">Todos los miembros</option>${members.map(m => `<option value="${esc(m.id)}">${esc(m.displayName)}</option>`).join('')}`;
  $('#members').textContent = members.length;
}

function renderDynamicFields() {
  dynamicFields.innerHTML = fields.map(field => {
    const required = field.isRequired ? 'required' : '';
    if (field.fieldType === 'single_select') return `<label class="field">${esc(field.name)}<select data-field-id="${esc(field.id)}" ${required}><option value="">Sin seleccionar</option>${field.options.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('')}</select></label>`;
    if (field.fieldType === 'multi_select') return `<fieldset class="field"><legend>${esc(field.name)}</legend>${field.options.map(o => `<label><input type="checkbox" data-field-id="${esc(field.id)}" value="${esc(o.id)}"> ${esc(o.label)}</label>`).join('')}</fieldset>`;
    return `<label class="field">${esc(field.name)}<input data-field-id="${esc(field.id)}" ${required}></label>`;
  }).join('');
}

function renderDynamicFilters() {
  dynamicFilters.innerHTML = fields.filter(f => f.isFilterable && f.options?.length).map(field => `<label class="field">${esc(field.name)}<select data-filter-field="${esc(field.id)}"><option value="">Todos</option>${field.options.map(o => `<option value="${esc(o.label.toLowerCase())}">${esc(o.label)}</option>`).join('')}</select></label>`).join('');
}

async function loadFields() {
  fields = await api(`/api/v1/groups/${groupSelect.value}/fields`);
  renderDynamicFields();
  renderDynamicFilters();
}

function collectFieldValues() {
  const values = {};
  for (const field of fields) {
    const controls = [...document.querySelectorAll(`[data-field-id="${CSS.escape(field.id)}"]`)];
    if (field.fieldType === 'multi_select') values[field.id] = controls.filter(c => c.checked).map(c => c.value);
    else if (field.fieldType === 'single_select') values[field.id] = controls[0]?.value ? [controls[0].value] : [];
  }
  return values;
}

function applyInspection(data, raw) {
  inspection = data;
  $('#resourceUrl').value = data.url || raw;
  if (data.title) $('#title').value = data.title;
  if (data.description) $('#description').value = data.description;
  $('#resourceType').value = data.resourceType || 'link';
  $('#provider').value = data.provider || '';
  $('#thumbnailUrl').value = data.thumbnailUrl || '';
  const preview = $('#metadataPreview');
  preview.hidden = false;
  preview.innerHTML = `${data.thumbnailUrl ? `<img src="${esc(data.thumbnailUrl)}" alt="">` : '<div class="cover cover-placeholder">↗</div>'}<div><strong>${esc(data.title || 'Enlace reconocido')}</strong><p class="muted">${esc(data.provider || 'Enlace')} · ${esc(data.resourceType || 'link')}</p></div>`;
}

async function inspectResource() {
  const raw = $('#resourceUrl').value.trim();
  if (!raw) return;
  const button = $('#inspectButton');
  button.disabled = true; button.textContent = 'Analizando…'; formMessage.textContent = 'Consultando metadatos…';
  try { const data = await api('/api/v1/resources/inspect',{method:'POST',body:JSON.stringify({url:raw})}); applyInspection(data,raw); formMessage.textContent='Datos completados. Revisa y guarda.'; }
  catch (e) { inspection=null; formMessage.textContent=`${e.message}. Puedes completar los datos manualmente.`; }
  finally { button.disabled=false; button.textContent='Reconocer'; }
}

function filteredItems() {
  const filters = [...document.querySelectorAll('[data-filter-field]')].map(el => el.value).filter(Boolean);
  if (!filters.length) return currentItems;
  return currentItems.filter(item => filters.every(value => JSON.stringify(item).toLowerCase().includes(value)));
}

function card(item) {
  const image = item.thumbnailUrl ? `<img class="cover" src="${esc(item.thumbnailUrl)}" alt="">` : '<div class="cover cover-placeholder">↗</div>';
  return `<article class="music-card" data-id="${esc(item.id)}"><div class="music-main">${image}<div class="music-copy"><p class="eyebrow">${esc(item.provider || 'Enlace')} · ${esc(item.resourceType || 'link')}</p><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.url)}</a></h3>${item.description?`<p>${esc(item.description)}</p>`:''}<div class="meta"><span class="chip">por ${esc(item.addedBy)}</span><span class="chip">${new Date(item.createdAt).toLocaleDateString()}</span></div>${item.canEdit?`<button class="edit-link" data-edit="${esc(item.id)}" type="button">Editar ficha</button>`:''}</div></div><div class="music-footer"><div class="rating">${[1,2,3,4,5].map(v=>`<button type="button" data-rating="${v}">${v<=Math.round(item.rating)?'★':'☆'}</button>`).join('')}<small>${Number(item.rating).toFixed(1)} · ${item.votes} votos</small></div><small>${item.comments} comentarios</small></div><details><summary>Abrir conversación</summary><div class="comments"></div><form class="comment-form"><input name="body" required maxlength="4000" placeholder="Escribe un comentario"><button class="button button-secondary">Publicar</button></form></details></article>`;
}

function renderDashboard() {
  const items = filteredItems();
  resourceList.innerHTML = items.length ? items.map(card).join('') : '<p class="empty-state">No hay resultados.</p>';
  $('#total').textContent = currentItems.length;
  const now = new Date();
  $('#month').textContent = currentItems.filter(i => { const d=new Date(i.createdAt); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).length;
  $('#commentCount').textContent = currentItems.reduce((sum,i)=>sum+Number(i.comments||0),0);
  $('#recentList').innerHTML = currentItems.slice(0,5).map(i=>`<a class="recent-item" href="${esc(i.url)}" target="_blank"><div><strong>${esc(i.title)}</strong><p>por ${esc(i.addedBy)}</p><small>${new Date(i.createdAt).toLocaleString()}</small></div></a>`).join('') || '<p class="empty-state">Todavía no hay recursos.</p>';
  $('#rankingList').innerHTML = [...currentItems].filter(i=>i.votes>0).sort((a,b)=>b.rating-a.rating||b.votes-a.votes).slice(0,5).map((i,index)=>`<article class="ranking-item"><span class="ranking-position">${index+1}</span><div><strong>${esc(i.title)}</strong><small>★ ${Number(i.rating).toFixed(1)} · ${i.votes} votos</small></div></article>`).join('') || '<p class="empty-state">Aún no hay valoraciones.</p>';
}

async function loadResources() {
  const params = new URLSearchParams();
  if ($('#search').value.trim()) params.set('q',$('#search').value.trim());
  if ($('#memberFilter').value) params.set('addedBy',$('#memberFilter').value);
  currentItems = await api(`/api/v1/groups/${groupSelect.value}/resource-dashboard?${params}`);
  renderDashboard();
}

async function refreshGroup() { await Promise.all([loadFields(),loadMembers(),loadResources()]); }

async function loadComments(cardEl) {
  const comments = await api(`/api/v1/resources/${cardEl.dataset.id}/comments`);
  cardEl.querySelector('.comments').innerHTML = comments.length ? comments.map(c=>`<p><strong>${esc(c.displayName)}</strong>: ${esc(c.body)}<br><small>${new Date(c.createdAt).toLocaleString()}</small></p>`).join('') : '<p class="muted">Todavía no hay comentarios.</p>';
}

function openEdit(id) {
  const item=currentItems.find(i=>i.id===id); if(!item)return;
  $('#editId').value=item.id; $('#editTitle').value=item.title||''; $('#editProvider').value=item.provider||''; $('#editDescription').value=item.description||''; $('#editComment').value=item.originalComment||''; $('#editThumbnailUrl').value=item.thumbnailUrl||''; $('#editMessage').textContent=''; editDialog.showModal();
}

$('#toggleAdd').addEventListener('click',()=>{addPanel.hidden=!addPanel.hidden;});
$('#inspectButton').addEventListener('click',inspectResource);
$('#resourceUrl').addEventListener('paste',()=>setTimeout(inspectResource,50));
$('#reload').addEventListener('click',loadResources);
$('#filters').addEventListener('submit',e=>{e.preventDefault();loadResources();});
$('#search').addEventListener('input',()=>{clearTimeout(window.searchTimer);window.searchTimer=setTimeout(loadResources,250);});
$('#memberFilter').addEventListener('change',loadResources);
dynamicFilters.addEventListener('change',renderDashboard);
groupSelect.addEventListener('change',refreshGroup);
$('#logout').addEventListener('click',()=>{setToken('');location.href='./login.html';});

$('#resourceForm').addEventListener('submit',async e=>{e.preventDefault();formMessage.textContent='Guardando…';try{const url=$('#resourceUrl').value.trim();await api(`/api/v1/groups/${groupSelect.value}/resources`,{method:'POST',body:JSON.stringify({url,normalizedUrl:inspection?.finalUrl||url,finalUrl:inspection?.finalUrl||'',title:$('#title').value.trim(),description:$('#description').value.trim(),resourceType:$('#resourceType').value,provider:$('#provider').value.trim(),mimeType:inspection?.mimeType||'',thumbnailUrl:$('#thumbnailUrl').value.trim(),originalComment:$('#comment').value.trim(),sourceType:'manual',fieldValues:collectFieldValues(),tags:$('#tags').value.split(',').map(v=>v.trim()).filter(Boolean)})});e.target.reset();inspection=null;renderDynamicFields();$('#metadataPreview').hidden=true;formMessage.textContent='Recurso guardado.';await loadResources();}catch(err){formMessage.textContent=err.message;}});

resourceList.addEventListener('click',async e=>{const cardEl=e.target.closest('.music-card');if(!cardEl)return;if(e.target.dataset.edit){openEdit(e.target.dataset.edit);return;}if(e.target.dataset.rating){await api(`/api/v1/resources/${cardEl.dataset.id}/rating`,{method:'PUT',body:JSON.stringify({value:Number(e.target.dataset.rating)})});await loadResources();}});
resourceList.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS'&&e.target.open)loadComments(e.target.closest('.music-card'));},true);
resourceList.addEventListener('submit',async e=>{if(!e.target.matches('.comment-form'))return;e.preventDefault();const cardEl=e.target.closest('.music-card');const input=e.target.elements.body;await api(`/api/v1/resources/${cardEl.dataset.id}/comments`,{method:'POST',body:JSON.stringify({body:input.value.trim()})});input.value='';await loadComments(cardEl);await loadResources();});

$('#editForm').addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/v1/resources/${$('#editId').value}`,{method:'PATCH',body:JSON.stringify({Title:$('#editTitle').value.trim(),Description:$('#editDescription').value.trim(),Provider:$('#editProvider').value.trim(),OriginalComment:$('#editComment').value.trim(),ThumbnailURL:$('#editThumbnailUrl').value.trim()})});editDialog.close();await loadResources();}catch(err){$('#editMessage').textContent=err.message;}});
$('#deleteItem').addEventListener('click',async()=>{const item=currentItems.find(i=>i.id===$('#editId').value);if(!item||!confirm(`¿Eliminar “${item.title}”?`))return;try{await api(`/api/v1/resources/${item.id}`,{method:'DELETE'});editDialog.close();await loadResources();}catch(err){$('#editMessage').textContent=err.message;}});
$('#closeEdit').addEventListener('click',()=>editDialog.close());
$('#cancelEdit').addEventListener('click',()=>editDialog.close());

(async()=>{try{await loadGroups();await refreshGroup();}catch(err){resourceList.textContent=err.message;}})();
