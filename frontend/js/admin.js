import { api, getApiUrl, setToken } from "./api.js";

const profile = document.querySelector("#profile");
const groupSelect = document.querySelector("#groupSelect");
const requests = document.querySelector("#requests");
const inviteResult = document.querySelector("#inviteResult");

async function load() {
  try {
    const [me, groups] = await Promise.all([api("/api/v1/me"), api("/api/v1/groups")]);
    profile.textContent = `${me.displayName} · ${me.email}`;
    groupSelect.innerHTML = groups.map(group => `<option value="${group.id}">${group.name} (${group.role})</option>`).join("");
    if (groups.length) await loadRequests();
  } catch (error) {
    profile.textContent = error.message;
  }
}

async function loadRequests() {
  const groupId = groupSelect.value;
  if (!groupId) return;
  try {
    const items = await api(`/api/v1/groups/${groupId}/membership-requests`);
    requests.innerHTML = items.length ? items.map(item => `<article><strong>${item.displayName}</strong><p>${item.email}</p><button class="button" data-user="${item.id}">Aprobar</button></article>`).join("") : "No hay solicitudes pendientes.";
  } catch (error) {
    requests.textContent = error.message;
  }
}

groupSelect.addEventListener("change", loadRequests);
requests.addEventListener("click", async event => {
  const userId = event.target.dataset.user;
  if (!userId) return;
  await api(`/api/v1/groups/${groupSelect.value}/membership-requests/${userId}/approve`, { method: "POST" });
  await loadRequests();
});

document.querySelector("#inviteForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api(`/api/v1/groups/${groupSelect.value}/invitations`, {
      method: "POST",
      body: JSON.stringify({ expiresHours: Number(document.querySelector("#expiresHours").value), maxUses: Number(document.querySelector("#maxUses").value) })
    });
    const invitationUrl = new URL(result.url);
    invitationUrl.searchParams.set("api", getApiUrl());
    const finalUrl = invitationUrl.toString();
    inviteResult.innerHTML = `Enlace: <a href="${finalUrl}">${finalUrl}</a>`;
  } catch (error) {
    inviteResult.textContent = error.message;
  }
});

document.querySelector("#logout").addEventListener("click", () => {
  setToken("");
  location.href = "./login.html";
});

load();