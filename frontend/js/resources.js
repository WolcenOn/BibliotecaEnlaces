import { api, setToken } from "./api.js";

const $ = selector => document.querySelector(selector);
const groupSelect = $("#groupSelect");
const dynamicFields = $("#dynamicFields");
const resourceList = $("#resourceList");
const addPanel = $("#addPanel");
const formMessage = $("#formMessage");
let fields = [];

const esc = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

async function loadGroups() {
  const groups = await api("/api/v1/groups");
  groupSelect.innerHTML = groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join("");
  if (!groups.length) throw new Error("No perteneces a ninguna biblioteca activa.");
}

function renderDynamicFields() {
  dynamicFields.innerHTML = fields.map(field => {
    const required = field.isRequired ? "required" : "";
    if (field.fieldType === "single_select") {
      return `<label class="field">${esc(field.name)}<select data-field-id="${esc(field.id)}" ${required}><option value="">Sin seleccionar</option>${field.options.map(option => `<option value="${esc(option.id)}">${esc(option.label)}</option>`).join("")}</select></label>`;
    }
    if (field.fieldType === "multi_select") {
      return `<fieldset class="field"><legend>${esc(field.name)}</legend>${field.options.map(option => `<label><input type="checkbox" data-field-id="${esc(field.id)}" value="${esc(option.id)}"> ${esc(option.label)}</label>`).join("")}</fieldset>`;
    }
    return `<label class="field">${esc(field.name)}<input data-field-id="${esc(field.id)}" ${required}></label>`;
  }).join("");
}

async function loadFields() {
  fields = await api(`/api/v1/groups/${groupSelect.value}/fields`);
  renderDynamicFields();
}

function collectFieldValues() {
  const values = {};
  for (const field of fields) {
    const controls = [...document.querySelectorAll(`[data-field-id="${CSS.escape(field.id)}"]`)];
    if (field.fieldType === "multi_select") {
      values[field.id] = controls.filter(control => control.checked).map(control => control.value);
    } else if (field.fieldType === "single_select") {
      const value = controls[0]?.value;
      values[field.id] = value ? [value] : [];
    }
  }
  return values;
}

function detectFromURL(raw) {
  const url = new URL(raw);
  const host = url.hostname.replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".pdf")) return { resourceType: "pdf", provider: host };
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(path)) return { resourceType: "image", provider: host, thumbnailUrl: raw };
  if (["youtube.com", "youtu.be", "vimeo.com"].includes(host)) return { resourceType: "video", provider: host };
  if (host === "docs.google.com") {
    if (path.includes("/document/")) return { resourceType: "document", provider: "Google Docs" };
    if (path.includes("/presentation/")) return { resourceType: "presentation", provider: "Google Slides" };
    if (path.includes("/spreadsheets/")) return { resourceType: "spreadsheet", provider: "Google Sheets" };
  }
  if (host === "drive.google.com") return { resourceType: "document", provider: "Google Drive" };
  return { resourceType: "link", provider: host };
}

async function inspectResource() {
  const raw = $("#resourceUrl").value.trim();
  if (!raw) return;
  try {
    const detected = detectFromURL(raw);
    $("#resourceType").value = detected.resourceType;
    $("#provider").value = detected.provider;
    if (detected.thumbnailUrl) $("#thumbnailUrl").value = detected.thumbnailUrl;
    const preview = $("#metadataPreview");
    preview.hidden = false;
    preview.innerHTML = `<div><strong>${esc(detected.provider)}</strong><p class="muted">Tipo detectado: ${esc(detected.resourceType)}</p></div>`;
    formMessage.textContent = "Tipo detectado. Revisa el título, la miniatura y la clasificación.";
  } catch {
    formMessage.textContent = "El enlace no tiene un formato válido.";
  }
}

function resourceCard(item) {
  const image = item.thumbnailUrl ? `<img class="cover" src="${esc(item.thumbnailUrl)}" alt="" loading="lazy">` : `<div class="cover cover-placeholder">↗</div>`;
  return `<article class="music-card"><div class="music-main">${image}<div class="music-copy"><p class="eyebrow">${esc(item.provider || "Enlace")} · ${esc(item.resourceType)}</p><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.url)}</a></h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}<div class="meta"><span class="chip">${new Date(item.createdAt).toLocaleDateString()}</span>${item.sourceAuthor ? `<span class="chip">${esc(item.sourceAuthor)}</span>` : ""}</div></div></div></article>`;
}

async function loadResources() {
  const items = await api(`/api/v1/groups/${groupSelect.value}/resources`);
  resourceList.innerHTML = items.length ? items.map(resourceCard).join("") : `<p class="empty-state">Todavía no hay recursos en esta biblioteca.</p>`;
}

async function refreshGroup() {
  await Promise.all([loadFields(), loadResources()]);
}

$("#toggleAdd").addEventListener("click", () => {
  addPanel.hidden = !addPanel.hidden;
  if (!addPanel.hidden) $("#resourceUrl").focus();
});
$("#inspectButton").addEventListener("click", inspectResource);
$("#resourceUrl").addEventListener("paste", () => setTimeout(inspectResource, 50));
$("#reload").addEventListener("click", loadResources);
groupSelect.addEventListener("change", refreshGroup);
$("#logout").addEventListener("click", () => { setToken(""); location.href = "./login.html"; });

$("#resourceForm").addEventListener("submit", async event => {
  event.preventDefault();
  formMessage.textContent = "Guardando…";
  try {
    const url = $("#resourceUrl").value.trim();
    await api(`/api/v1/groups/${groupSelect.value}/resources`, {
      method: "POST",
      body: JSON.stringify({
        url,
        normalizedUrl: url,
        title: $("#title").value.trim(),
        description: $("#description").value.trim(),
        resourceType: $("#resourceType").value,
        provider: $("#provider").value.trim(),
        thumbnailUrl: $("#thumbnailUrl").value.trim(),
        originalComment: $("#comment").value.trim(),
        sourceType: "manual",
        fieldValues: collectFieldValues(),
        tags: $("#tags").value.split(",").map(value => value.trim()).filter(Boolean)
      })
    });
    event.target.reset();
    renderDynamicFields();
    $("#metadataPreview").hidden = true;
    formMessage.textContent = "Recurso guardado.";
    await loadResources();
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

(async () => {
  try {
    await loadGroups();
    await refreshGroup();
    const params = new URLSearchParams(location.search);
    const shared = [params.get("url"), params.get("text")].filter(Boolean).join(" ").match(/https?:\/\/[^\s]+/i)?.[0];
    if (shared) {
      addPanel.hidden = false;
      $("#resourceUrl").value = shared.replace(/[),.;]+$/, "");
      history.replaceState({}, "", location.pathname);
      await inspectResource();
    }
  } catch (error) {
    resourceList.textContent = error.message;
  }
})();
