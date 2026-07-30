import { api, setToken } from "./api.js";

const $ = selector => document.querySelector(selector);
const groupSelect = $("#groupSelect");
const library = $("#library");
const formMessage = $("#formMessage");
const inspectButton = $("#inspectButton");
const metadataPreview = $("#metadataPreview");
const recentList = $("#recentList");
const editDialog = $("#editDialog");
const selectionBar = $("#selectionBar");
let currentItems = [];
const selected = new Set();

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

async function loadGroups() {
  const groups = await api("/api/v1/groups");
  groupSelect.innerHTML = groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join("");
  if (!groups.length) throw new Error("No perteneces a ningún grupo activo.");
}

async function loadGenres() {
  const genres = await api("/api/v1/genres");
  const options = genres.map(genre => `<option value="${esc(genre.name)}">${esc(genre.name)}</option>`).join("");
  $("#genre").insertAdjacentHTML("beforeend", options);
  $("#genreFilter").insertAdjacentHTML("beforeend", options);
  $("#editGenre").insertAdjacentHTML("beforeend", options);
}

async function loadMembers() {
  const members = await api(`/api/v1/groups/${groupSelect.value}/members`);
  $("#memberFilter").innerHTML = `<option value="">Todos los miembros</option>${members.map(member => `<option value="${esc(member.id)}">${esc(member.displayName)}</option>`).join("")}`;
}

function compactItem(item) {
  return `${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy">` : `<div class="recent-cover">♫</div>`}<div><strong>${esc(item.title)}</strong><p>${esc(item.artist || "Artista sin indicar")}</p><small>por ${esc(item.addedBy)} · ${new Date(item.addedAt).toLocaleDateString()}</small></div>`;
}

async function loadDashboard() {
  const data = await api(`/api/v1/groups/${groupSelect.value}/dashboard`);
  $("#total").textContent = data.total;
  $("#month").textContent = data.month;
  $("#members").textContent = data.members;
  $("#commentCount").textContent = data.comments;
  recentList.innerHTML = data.recent?.length ? data.recent.map(item => `<article class="recent-item">${compactItem(item)}</article>`).join("") : `<p class="empty-state">Todavía no hay incorporaciones.</p>`;
}

async function loadRankings() {
  const data = await api(`/api/v1/groups/${groupSelect.value}/rankings?period=${$("#rankingPeriod").value}`);
  $("#rankingList").innerHTML = data.items.length ? data.items.map(item => `<article class="ranking-item"><span class="ranking-position">${item.position}</span>${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="" loading="lazy">` : `<div class="ranking-cover">♫</div>`}<div><strong><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></strong><p>${esc(item.artist || "Artista sin indicar")}</p><small>★ ${Number(item.rating).toFixed(1)} · ${item.votes} votos</small></div></article>`).join("") : `<p class="empty-state">Aún no hay canciones puntuadas en este periodo.</p>`;
}

function queryString() {
  const values = {
    q: $("#search").value.trim(),
    platform: $("#platform").value,
    type: $("#type").value,
    genre: $("#genreFilter").value,
    addedBy: $("#memberFilter").value
  };
  const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  return params.toString() ? `?${params}` : "";
}

function cover(item) {
  return item.imageUrl ? `<img class="cover" src="${esc(item.imageUrl)}" alt="" loading="lazy">` : `<div class="cover cover-placeholder" aria-hidden="true">♫</div>`;
}

function updateSelectionBar() {
  $("#selectionCount").textContent = selected.size;
  selectionBar.hidden = selected.size === 0;
}

async function loadLibrary() {
  currentItems = await api(`/api/v1/groups/${groupSelect.value}/music${queryString()}`);
  const visibleIDs = new Set(currentItems.map(item => item.id));
  for (const id of selected) if (!visibleIDs.has(id)) selected.delete(id);
  library.innerHTML = currentItems.length ? currentItems.map(item => `<article class="music-card" data-id="${esc(item.id)}"><label class="select-item" title="Añadir a la selección"><input type="checkbox" data-select="${esc(item.id)}" ${selected.has(item.id) ? "checked" : ""}><span>Seleccionar</span></label><div class="music-main">${cover(item)}<div class="music-copy"><p class="eyebrow platform-${esc(item.platform)}">${esc(item.platform)} · ${esc(item.type)}</p><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><p class="artist">${esc(item.artist || "Artista sin indicar")}</p><div class="meta">${item.genre ? `<span class="chip">${esc(item.genre)}</span>` : ""}<span class="chip">por ${esc(item.addedBy)}</span><span class="chip">${new Date(item.addedAt).toLocaleDateString()}</span></div>${item.canEdit ? `<button class="edit-link" type="button" data-edit="${esc(item.id)}">Editar ficha</button>` : ""}</div></div><div class="music-footer"><div class="rating">${[1,2,3,4,5].map(value => `<button type="button" data-rating="${value}" title="${value} estrellas">${value <= Math.round(item.rating) ? "★" : "☆"}</button>`).join("")}<small>${Number(item.rating).toFixed(1)} · ${item.votes} votos</small></div><small class="muted">${item.comments} comentarios</small></div><details><summary>Abrir conversación</summary><div class="comments"></div><form class="comment-form"><input name="body" required maxlength="4000" placeholder="Escribe un comentario"><button class="button button-secondary">Publicar</button></form></details></article>`).join("") : `<p class="empty-state">No hay resultados con estos filtros.</p>`;
  updateSelectionBar();
}

async function refresh() {
  try { await Promise.all([loadDashboard(), loadRankings(), loadLibrary()]); }
  catch (error) { library.textContent = error.message; }
}

async function inspectUrl() {
  const raw = $("#musicUrl").value.trim();
  if (!raw) return;
  inspectButton.disabled = true;
  inspectButton.textContent = "Buscando…";
  formMessage.textContent = "Consultando los datos del enlace…";
  try {
    const data = await api("/api/v1/links/metadata", { method: "POST", body: JSON.stringify({ url: raw }) });
    $("#musicUrl").value = data.url || raw;
    if (data.title) $("#title").value = data.title;
    if (data.artist) $("#artist").value = data.artist;
    $("#imageUrl").value = data.imageUrl || "";
    metadataPreview.hidden = false;
    metadataPreview.className = "metadata-preview";
    metadataPreview.innerHTML = `${data.imageUrl ? `<img src="${esc(data.imageUrl)}" alt="">` : `<div class="cover cover-placeholder">♫</div>`}<div><strong>${esc(data.title || "Enlace reconocido")}</strong><p class="muted">${esc(data.artist || `${data.platform} · ${data.type}`)}</p></div>`;
    formMessage.textContent = data.title ? "Datos completados. Puedes corregirlos antes de guardar." : "Enlace reconocido; completa los campos que falten.";
  } catch (error) { formMessage.textContent = error.message; }
  finally { inspectButton.disabled = false; inspectButton.textContent = "Completar"; }
}

async function loadComments(card) {
  const comments = await api(`/api/v1/music/${card.dataset.id}/comments`);
  card.querySelector(".comments").innerHTML = comments.length ? comments.map(comment => `<p><strong>${esc(comment.displayName)}</strong>: ${esc(comment.body)}<br><small class="muted">${new Date(comment.createdAt).toLocaleString()}</small></p>`).join("") : `<p class="muted">Todavía no hay comentarios.</p>`;
}

function openEdit(id) {
  const item = currentItems.find(candidate => candidate.id === id);
  if (!item) return;
  $("#editId").value = item.id;
  $("#editTitle").value = item.title;
  $("#editArtist").value = item.artist || "";
  $("#editGenre").value = item.genre || "";
  $("#editComment").value = item.comment || "";
  $("#editImageUrl").value = item.imageUrl || "";
  $("#editMessage").textContent = "";
  editDialog.showModal();
}

function selectedItems(platform) {
  return currentItems.filter(item => selected.has(item.id) && (!platform || item.platform === platform));
}

function youtubeVideoID(raw) {
  try { return new URL(raw).searchParams.get("v") || ""; } catch { return ""; }
}

inspectButton.addEventListener("click", inspectUrl);
$("#musicUrl").addEventListener("paste", () => setTimeout(inspectUrl, 50));
$("#musicForm").addEventListener("submit", async event => {
  event.preventDefault(); formMessage.textContent = "Guardando…";
  try {
    await api(`/api/v1/groups/${groupSelect.value}/music`, { method: "POST", body: JSON.stringify({ url: $("#musicUrl").value.trim(), title: $("#title").value.trim(), artist: $("#artist").value.trim(), genre: $("#genre").value, comment: $("#comment").value.trim(), imageUrl: $("#imageUrl").value.trim() }) });
    event.target.reset(); metadataPreview.hidden = true; formMessage.textContent = "Guardada en la biblioteca."; await refresh();
  } catch (error) { formMessage.textContent = error.message; }
});

$("#editForm").addEventListener("submit", async event => {
  event.preventDefault(); const message = $("#editMessage"); message.textContent = "Guardando…";
  try {
    await api(`/api/v1/music/${$("#editId").value}`, { method: "PATCH", body: JSON.stringify({ title: $("#editTitle").value.trim(), artist: $("#editArtist").value.trim(), genre: $("#editGenre").value, comment: $("#editComment").value.trim(), imageUrl: $("#editImageUrl").value.trim() }) });
    editDialog.close(); await refresh();
  } catch (error) { message.textContent = error.message; }
});

$("#deleteItem").addEventListener("click", async () => {
  const item = currentItems.find(candidate => candidate.id === $("#editId").value);
  if (!item || !confirm(`¿Eliminar definitivamente “${item.title}”? También se borrarán sus votos y comentarios del grupo.`)) return;
  $("#editMessage").textContent = "Eliminando…";
  try { await api(`/api/v1/music/${item.id}`, { method: "DELETE" }); selected.delete(item.id); editDialog.close(); await refresh(); }
  catch (error) { $("#editMessage").textContent = error.message; }
});

$("#closeEdit").addEventListener("click", () => editDialog.close());
$("#cancelEdit").addEventListener("click", () => editDialog.close());
$("#filters").addEventListener("submit", event => { event.preventDefault(); loadLibrary(); });
$("#search").addEventListener("input", () => { clearTimeout(window.searchTimer); window.searchTimer = setTimeout(loadLibrary, 250); });
$("#rankingPeriod").addEventListener("change", loadRankings);
groupSelect.addEventListener("change", async () => { selected.clear(); await loadMembers(); await refresh(); });

library.addEventListener("change", event => {
  const id = event.target.dataset.select;
  if (!id) return;
  event.target.checked ? selected.add(id) : selected.delete(id);
  updateSelectionBar();
});

library.addEventListener("click", async event => {
  const card = event.target.closest(".music-card");
  if (!card) return;
  if (event.target.dataset.edit) { openEdit(event.target.dataset.edit); return; }
  if (event.target.dataset.rating) { await api(`/api/v1/music/${card.dataset.id}/rating`, { method: "PUT", body: JSON.stringify({ value: Number(event.target.dataset.rating) }) }); await Promise.all([loadLibrary(), loadRankings()]); }
});

library.addEventListener("toggle", event => { const details = event.target; if (details.tagName === "DETAILS" && details.open) loadComments(details.closest(".music-card")); }, true);
library.addEventListener("submit", async event => { if (!event.target.matches(".comment-form")) return; event.preventDefault(); const card = event.target.closest(".music-card"), input = event.target.elements.body; await api(`/api/v1/music/${card.dataset.id}/comments`, { method: "POST", body: JSON.stringify({ body: input.value.trim() }) }); input.value = ""; await loadComments(card); await loadDashboard(); });

$("#playYouTube").addEventListener("click", () => {
  const ids = selectedItems("youtube").map(item => youtubeVideoID(item.url)).filter(Boolean);
  if (!ids.length) return alert("Selecciona al menos un vídeo de YouTube. Las playlists completas no se añaden a esta cola.");
  window.open(`https://www.youtube.com/watch_videos?video_ids=${encodeURIComponent(ids.join(","))}`, "_blank", "noopener,noreferrer");
});

$("#openSpotify").addEventListener("click", async () => {
  const items = selectedItems("spotify");
  if (!items.length) return alert("Selecciona al menos un enlace de Spotify.");
  await navigator.clipboard.writeText(items.map(item => `${item.title} — ${item.artist}\n${item.url}`).join("\n\n"));
  window.open(items[0].url, "_blank", "noopener,noreferrer");
  alert("Se ha abierto el primer enlace y se ha copiado la selección completa. Crear una playlist real en Spotify requerirá autorizar tu cuenta en una próxima mejora.");
});

$("#copySelection").addEventListener("click", async () => {
  const items = selectedItems();
  await navigator.clipboard.writeText(items.map(item => `${item.title} — ${item.artist}\n${item.url}`).join("\n\n"));
  alert("Lista copiada al portapapeles.");
});
$("#clearSelection").addEventListener("click", () => { selected.clear(); document.querySelectorAll("[data-select]").forEach(input => { input.checked = false; }); updateSelectionBar(); });
$("#logout").addEventListener("click", () => { setToken(""); location.href = "./login.html"; });

(async () => {
  try { await Promise.all([loadGroups(), loadGenres()]); await loadMembers(); await refresh(); }
  catch (error) { library.textContent = error.message; }
})();
