import { api, getApiUrl, setToken } from "./api.js";

const profile = document.querySelector("#profile");
const groupSelect = document.querySelector("#groupSelect");
const requests = document.querySelector("#requests");
const inviteResult = document.querySelector("#inviteResult");

function replaceChildren(parent, children) {
  parent.replaceChildren(...children);
}

function groupOption(group) {
  const option = document.createElement("option");
  option.value = String(group.id || "");
  option.textContent = `${group.name || "Grupo"} (${group.role || "member"})`;
  return option;
}

function requestCard(item) {
  const article = document.createElement("article");
  const name = document.createElement("strong");
  const email = document.createElement("p");
  const button = document.createElement("button");

  name.textContent = item.displayName || "Usuario sin nombre";
  email.textContent = item.email || "";
  button.className = "button";
  button.type = "button";
  button.dataset.user = String(item.id || "");
  button.textContent = "Aprobar";

  article.append(name, email, button);
  return article;
}

async function load() {
  try {
    const [me, groups] = await Promise.all([api("/api/v1/me"), api("/api/v1/groups")]);
    profile.textContent = `${me.displayName} · ${me.email}`;
    replaceChildren(groupSelect, groups.map(groupOption));
    if (groups.length) await loadRequests();
    else requests.textContent = "No perteneces a ningún grupo administrable.";
  } catch (error) {
    profile.textContent = error.message;
  }
}

async function loadRequests() {
  const groupId = groupSelect.value;
  if (!groupId) return;
  try {
    const items = await api(`/api/v1/groups/${encodeURIComponent(groupId)}/membership-requests`);
    if (!items.length) {
      requests.textContent = "No hay solicitudes pendientes.";
      return;
    }
    replaceChildren(requests, items.map(requestCard));
  } catch (error) {
    requests.textContent = error.message;
  }
}

groupSelect.addEventListener("change", loadRequests);
requests.addEventListener("click", async event => {
  const button = event.target.closest("button[data-user]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/membership-requests/${encodeURIComponent(button.dataset.user)}/approve`, { method: "POST" });
    await loadRequests();
  } catch (error) {
    requests.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#inviteForm").addEventListener("submit", async event => {
  event.preventDefault();
  inviteResult.textContent = "Creando invitación…";
  try {
    const result = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/invitations`, {
      method: "POST",
      body: JSON.stringify({
        expiresHours: Number(document.querySelector("#expiresHours").value),
        maxUses: Number(document.querySelector("#maxUses").value)
      })
    });
    const invitationUrl = new URL(result.url);
    invitationUrl.searchParams.set("api", getApiUrl());

    const label = document.createTextNode("Enlace: ");
    const link = document.createElement("a");
    link.href = invitationUrl.toString();
    link.textContent = invitationUrl.toString();
    link.rel = "noopener noreferrer";
    replaceChildren(inviteResult, [label, link]);
  } catch (error) {
    inviteResult.textContent = error.message;
  }
});

document.querySelector("#logout").addEventListener("click", () => {
  setToken("");
  location.href = "./login.html";
});

load();