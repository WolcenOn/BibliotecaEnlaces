import { api, getApiUrl, setToken } from './api.js';

const $ = selector => document.querySelector(selector);
const profile = $('#profile');
const groupSelect = $('#groupSelect');
const requests = $('#requests');
const inviteResult = $('#inviteResult');
const membersList = $('#membersList');
const memberMessage = $('#memberMessage');
const memberDialog = $('#memberDialog');
let groups = [];
let members = [];
let currentUser = null;

function replaceChildren(parent, children) { parent.replaceChildren(...children); }
function groupOption(group) {
  const option = document.createElement('option');
  option.value = String(group.id || '');
  option.textContent = `${group.name || 'Biblioteca'} (${group.role || 'member'})`;
  return option;
}
function daysSince(value) {
  if (!value) return Infinity;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}
function isStale(member) {
  return member.status === 'active' && daysSince(member.lastActivity) >= Number($('#staleDays').value);
}
function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Sin actividad registrada';
}
function requestCard(item) {
  const article = document.createElement('article');
  article.className = 'request-card';
  article.innerHTML = `<div><strong></strong><p class="muted"></p></div><button class="button" type="button">Aprobar</button>`;
  article.querySelector('strong').textContent = item.displayName || 'Usuario sin nombre';
  article.querySelector('p').textContent = item.email || '';
  article.querySelector('button').dataset.user = String(item.id || '');
  return article;
}
function memberCard(item) {
  const stale = isStale(item);
  const article = document.createElement('article');
  article.className = `member-card${stale ? ' is-stale' : ''}`;
  const protectedOwner = item.role === 'owner';
  article.innerHTML = `
    <div><h3></h3><p class="member-email"></p><div class="member-metrics"></div></div>
    <div><span class="status-badge"></span><p class="role"></p></div>
    <div><strong>Última actividad</strong><p class="activity"></p></div>
    <div><strong>Incorporación</strong><p class="joined"></p></div>
    <div class="member-actions"></div>`;
  article.querySelector('h3').textContent = item.displayName || 'Sin nombre';
  article.querySelector('.member-email').textContent = item.email || '';
  const badge = article.querySelector('.status-badge');
  badge.className = `status-badge status-${item.status}`;
  badge.textContent = stale ? 'Sin actividad reciente' : ({ active: 'Activo', inactive: 'Inactivo', pending: 'Pendiente' }[item.status] || item.status);
  article.querySelector('.role').textContent = ({ owner: 'Propietario', admin: 'Administrador', member: 'Miembro' }[item.role] || item.role);
  article.querySelector('.activity').textContent = `${formatDate(item.lastActivity)}${Number.isFinite(daysSince(item.lastActivity)) ? ` · hace ${daysSince(item.lastActivity)} días` : ''}`;
  article.querySelector('.joined').textContent = formatDate(item.joinedAt);
  const metrics = article.querySelector('.member-metrics');
  [`${item.resources || 0} recursos`, `${item.comments || 0} comentarios`, `${item.ratings || 0} votos`].forEach(text => {
    const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = text; metrics.append(chip);
  });
  if (!protectedOwner && item.status !== 'pending') {
    const edit = document.createElement('button');
    edit.className = 'button button-secondary'; edit.type = 'button'; edit.dataset.editMember = item.id; edit.textContent = 'Editar';
    article.querySelector('.member-actions').append(edit);
  }
  return article;
}
function renderMembers() {
  const query = $('#memberSearch').value.trim().toLowerCase();
  const filter = $('#statusFilter').value;
  const visible = members.filter(member => {
    const matchesText = !query || `${member.displayName} ${member.email}`.toLowerCase().includes(query);
    const matchesStatus = !filter || (filter === 'stale' ? isStale(member) : member.status === filter);
    return matchesText && matchesStatus;
  });
  replaceChildren(membersList, visible.length ? visible.map(memberCard) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'No hay miembros que coincidan.' })]);
  $('#activeCount').textContent = members.filter(m => m.status === 'active').length;
  $('#pendingCount').textContent = members.filter(m => m.status === 'pending').length;
  $('#inactiveCount').textContent = members.filter(m => m.status === 'inactive').length;
  $('#staleCount').textContent = members.filter(isStale).length;
}
async function loadRequests() {
  const groupId = groupSelect.value;
  if (!groupId) return;
  try {
    const items = await api(`/api/v1/groups/${encodeURIComponent(groupId)}/membership-requests`);
    replaceChildren(requests, items.length ? items.map(requestCard) : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No hay solicitudes pendientes.' })]);
  } catch (error) { requests.textContent = error.message; }
}
async function loadMembers() {
  if (!groupSelect.value) return;
  memberMessage.textContent = 'Cargando miembros…';
  try {
    members = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/managed-members`);
    memberMessage.textContent = '';
    renderMembers();
  } catch (error) {
    memberMessage.textContent = error.message;
    membersList.replaceChildren();
  }
}
async function refreshGroup() { await Promise.all([loadRequests(), loadMembers()]); }
async function load() {
  try {
    [currentUser, groups] = await Promise.all([api('/api/v1/me'), api('/api/v1/groups')]);
    profile.textContent = `${currentUser.displayName} · ${currentUser.email}`;
    const administrable = groups.filter(group => ['owner', 'admin'].includes(group.role));
    replaceChildren(groupSelect, administrable.map(groupOption));
    if (administrable.length) await refreshGroup();
    else memberMessage.textContent = 'No administras ninguna biblioteca.';
  } catch (error) { profile.textContent = error.message; }
}
function openMember(id) {
  const member = members.find(item => item.id === id);
  if (!member) return;
  $('#memberId').value = member.id;
  $('#memberName').value = member.displayName || '';
  $('#memberRole').value = member.role === 'admin' ? 'admin' : 'member';
  $('#memberStatus').value = member.status === 'inactive' ? 'inactive' : 'active';
  $('#memberEditMessage').textContent = '';
  memberDialog.showModal();
}

groupSelect.addEventListener('change', refreshGroup);
$('#staleDays').addEventListener('change', renderMembers);
$('#statusFilter').addEventListener('change', renderMembers);
$('#memberSearch').addEventListener('input', renderMembers);
$('#reloadMembers').addEventListener('click', loadMembers);
requests.addEventListener('click', async event => {
  const button = event.target.closest('button[data-user]'); if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/membership-requests/${encodeURIComponent(button.dataset.user)}/approve`, { method: 'POST' });
    await refreshGroup();
  } catch (error) { requests.textContent = error.message; }
});
membersList.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-member]');
  if (button) openMember(button.dataset.editMember);
});
$('#memberForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('#memberEditMessage').textContent = 'Guardando…';
  try {
    await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/managed-members/${encodeURIComponent($('#memberId').value)}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName: $('#memberName').value.trim(), role: $('#memberRole').value, status: $('#memberStatus').value })
    });
    memberDialog.close(); await loadMembers();
  } catch (error) { $('#memberEditMessage').textContent = error.message; }
});
$('#removeMember').addEventListener('click', async () => {
  const member = members.find(item => item.id === $('#memberId').value);
  if (!member || !confirm(`¿Eliminar a ${member.displayName} de esta biblioteca? Sus recursos permanecerán guardados.`)) return;
  try {
    await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/managed-members/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
    memberDialog.close(); await refreshGroup();
  } catch (error) { $('#memberEditMessage').textContent = error.message; }
});
$('#closeMemberDialog').addEventListener('click', () => memberDialog.close());
$('#cancelMember').addEventListener('click', () => memberDialog.close());
$('#inviteForm').addEventListener('submit', async event => {
  event.preventDefault(); inviteResult.textContent = 'Creando invitación…';
  try {
    const result = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/invitations`, { method: 'POST', body: JSON.stringify({ expiresHours: Number($('#expiresHours').value), maxUses: Number($('#maxUses').value) }) });
    const invitationUrl = new URL(result.url); invitationUrl.searchParams.set('api', getApiUrl());
    const link = document.createElement('a'); link.href = invitationUrl.toString(); link.textContent = invitationUrl.toString(); link.rel = 'noopener noreferrer';
    replaceChildren(inviteResult, [document.createTextNode('Enlace: '), link]);
  } catch (error) { inviteResult.textContent = error.message; }
});
$('#logout').addEventListener('click', () => { setToken(''); location.href = './login.html'; });
load();
