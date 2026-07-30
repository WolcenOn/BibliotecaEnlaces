import { api, setToken } from "./api.js";

const groupSelect = document.querySelector("#groupSelect");
const library = document.querySelector("#library");
const formMessage = document.querySelector("#formMessage");
const inspectButton = document.querySelector("#inspectButton");
const metadataPreview = document.querySelector("#metadataPreview");

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

async function loadGroups() {
  const groups = await api("/api/v1/groups");
  groupSelect.innerHTML = groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join("");
  if (!groups.length) throw new Error("No perteneces a ningún grupo activo.");
}

async function loadDashboard() {
  const data = await api(`/api/v1/groups/${groupSelect.value}/dashboard`);
  document.querySelector("#total").textContent = data.total;
  document.querySelector("#month").textContent = data.month;
  document.querySelector("#members").textContent = data.members;
  document.querySelector("#commentCount").textContent = data.comments;
}

function queryString() {
  const values = {
    q: document.querySelector("#search").value.trim(),
    platform: document.querySelector("#platform").value,
    type: document.querySelector("#type").value,
    genre: document.querySelector("#genreFilter").value.trim()
  };
  const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  return params.toString() ? `?${params}` : "";
}

function cover(item) {
  return item.imageUrl
    ? `<img class="cover" src="${esc(item.imageUrl)}" alt="" loading="lazy">`
    : `<div class="cover cover-placeholder" aria-hidden="true">♫</div>`;
}

async function loadLibrary() {
  const items = await api(`/api/v1/groups/${groupSelect.value}/music${queryString()}`);
  library.innerHTML = items.length ? items.map(item => `
    <article class="music-card" data-id="${esc(item.id)}">
      <div class="music-main">
        ${cover(item)}
        <div class="music-copy">
          <p class="eyebrow platform-${esc(item.platform)}">${esc(item.platform)} · ${esc(item.type)}</p>
          <h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
          <p class="artist">${esc(item.artist || "Artista sin indicar")}</p>
          <div class="meta">${item.genre ? `<span class="chip">${esc(item.genre)}</span>` : ""}<span class="chip">por ${esc(item.addedBy)}</span><span class="chip">${new Date(item.addedAt).toLocaleDateString()}</span></div>
        </div>
      </div>
      <div class="music-footer">
        <div class="rating" aria-label="Puntuar">
          ${[1,2,3,4,5].map(value => `<button type="button" data-rating="${value}" title="${value} estrellas">${value <= Math.round(item.rating) ? "★" : "☆"}</button>`).join("")}
          <small>${Number(item.rating).toFixed(1)} · ${item.votes} votos</small>
        </div>
        <small class="muted">${item.comments} comentarios</small>
      </div>
      <details>
        <summary>Abrir conversación</summary>
        <div class="comments"></div>
        <form class="comment-form"><input name="body" required maxlength="4000" placeholder="Escribe un comentario"><button class="button button-secondary">Publicar</button></form>
      </details>
    </article>`).join("") : `<p class="empty-state">No hay resultados con estos filtros.</p>`;
}

async function refresh() {
  try { await Promise.all([loadDashboard(), loadLibrary()]); }
  catch (error) { library.textContent = error.message; }
}

async function inspectUrl() {
  const rawUrl = document.querySelector("#musicUrl").value.trim();
  if (!rawUrl) return;
  inspectButton.disabled = true;
  inspectButton.textContent = "Buscando…";
  formMessage.textContent = "Consultando los datos del enlace…";
  try {
    const data = await api("/api/v1/links/inspect", { method: "POST", body: JSON.stringify({ url: rawUrl }) });
    document.querySelector("#musicUrl").value = data.url || rawUrl;
    if (data.title) document.querySelector("#title").value = data.title;
    if (data.artist) document.querySelector("#artist").value = data.artist;
    document.querySelector("#imageUrl").value = data.imageUrl || "";
    metadataPreview.hidden = false;
    metadataPreview.className = "metadata-preview";
    metadataPreview.innerHTML = `${data.imageUrl ? `<img src="${esc(data.imageUrl)}" alt="">` : `<div class="cover cover-placeholder">♫</div>`}<div><strong>${esc(data.title || "Enlace reconocido")}</strong><p class="muted">${esc(data.artist || `${data.platform} · ${data.type}`)}</p></div>`;
    formMessage.textContent = data.title ? "Datos completados. Puedes corregirlos antes de guardar." : "Enlace reconocido; completa los campos que falten.";
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    inspectButton.disabled = false;
    inspectButton.textContent = "Completar";
  }
}

async function loadComments(card) {
  const comments = await api(`/api/v1/music/${card.dataset.id}/comments`);
  card.querySelector(".comments").innerHTML = comments.length ? comments.map(comment => `<p><strong>${esc(comment.displayName)}</strong>: ${esc(comment.body)}<br><small class="muted">${new Date(comment.createdAt).toLocaleString()}</small></p>`).join("") : "<p class=\"muted\">Todavía no hay comentarios.</p>";
}

inspectButton.addEventListener("click", inspectUrl);
document.querySelector("#musicUrl").addEventListener("paste", () => setTimeout(inspectUrl, 50));

document.querySelector("#musicForm").addEventListener("submit", async event => {
  event.preventDefault();
  formMessage.textContent = "Guardando…";
  try {
    await api(`/api/v1/groups/${groupSelect.value}/music`, {
      method: "POST",
      body: JSON.stringify({
        url: document.querySelector("#musicUrl").value.trim(),
        title: document.querySelector("#title").value.trim(),
        artist: document.querySelector("#artist").value.trim(),
        genre: document.querySelector("#genre").value.trim(),
        comment: document.querySelector("#comment").value.trim(),
        imageUrl: document.querySelector("#imageUrl").value.trim()
      })
    });
    event.target.reset();
    metadataPreview.hidden = true;
    formMessage.textContent = "Guardada en la biblioteca.";
    await refresh();
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

document.querySelector("#filters").addEventListener("submit", event => { event.preventDefault(); loadLibrary(); });
document.querySelector("#search").addEventListener("input", () => { clearTimeout(window.searchTimer); window.searchTimer = setTimeout(loadLibrary, 250); });
groupSelect.addEventListener("change", refresh);

library.addEventListener("click", async event => {
  const card = event.target.closest(".music-card");
  if (!card) return;
  if (event.target.dataset.rating) {
    await api(`/api/v1/music/${card.dataset.id}/rating`, { method: "PUT", body: JSON.stringify({ value: Number(event.target.dataset.rating) }) });
    await loadLibrary();
  }
});

library.addEventListener("toggle", event => {
  const details = event.target;
  if (details.tagName === "DETAILS" && details.open) loadComments(details.closest(".music-card"));
}, true);

library.addEventListener("submit", async event => {
  if (!event.target.matches(".comment-form")) return;
  event.preventDefault();
  const card = event.target.closest(".music-card");
  const input = event.target.elements.body;
  await api(`/api/v1/music/${card.dataset.id}/comments`, { method: "POST", body: JSON.stringify({ body: input.value.trim() }) });
  input.value = "";
  await loadComments(card);
  await loadDashboard();
});

document.querySelector("#logout").addEventListener("click", () => { setToken(""); location.href = "./login.html"; });

(async () => {
  try { await loadGroups(); await refresh(); }
  catch (error) { library.textContent = error.message; }
})();