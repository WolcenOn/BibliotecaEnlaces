import { api, setToken } from "./api.js";

const groupSelect = document.querySelector("#groupSelect");
const library = document.querySelector("#library");
const formMessage = document.querySelector("#formMessage");

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

async function loadLibrary() {
  const items = await api(`/api/v1/groups/${groupSelect.value}/music${queryString()}`);
  library.innerHTML = items.length ? items.map(item => `
    <article class="music-card" data-id="${esc(item.id)}">
      <div>
        <p class="eyebrow">${esc(item.platform)} · ${esc(item.type)}${item.genre ? ` · ${esc(item.genre)}` : ""}</p>
        <h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
        <p>${esc(item.artist || "Artista sin indicar")}</p>
        <small>Añadido por ${esc(item.addedBy)} · ${new Date(item.addedAt).toLocaleDateString()}</small>
      </div>
      <div class="rating" aria-label="Puntuar">
        ${[1,2,3,4,5].map(value => `<button type="button" data-rating="${value}" title="${value} estrellas">${value <= Math.round(item.rating) ? "★" : "☆"}</button>`).join("")}
        <small>${Number(item.rating).toFixed(1)} (${item.votes})</small>
      </div>
      <details>
        <summary>Comentarios (${item.comments})</summary>
        <div class="comments"></div>
        <form class="comment-form"><input name="body" required maxlength="4000" placeholder="Escribe un comentario"><button class="button button-secondary">Comentar</button></form>
      </details>
    </article>`).join("") : `<p class="empty-state">No hay resultados.</p>`;
}

async function refresh() {
  try {
    await Promise.all([loadDashboard(), loadLibrary()]);
  } catch (error) {
    library.textContent = error.message;
  }
}

async function loadComments(card) {
  const comments = await api(`/api/v1/music/${card.dataset.id}/comments`);
  card.querySelector(".comments").innerHTML = comments.length ? comments.map(comment => `<p><strong>${esc(comment.displayName)}</strong>: ${esc(comment.body)}<br><small>${new Date(comment.createdAt).toLocaleString()}</small></p>`).join("") : "<p>Sin comentarios.</p>";
}

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
        comment: document.querySelector("#comment").value.trim()
      })
    });
    event.target.reset();
    formMessage.textContent = "Canción guardada.";
    await refresh();
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

document.querySelector("#filters").addEventListener("submit", event => { event.preventDefault(); loadLibrary(); });
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
  try {
    await loadGroups();
    await refresh();
  } catch (error) {
    library.textContent = error.message;
  }
})();