import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const inspectButton = document.querySelector('#inspectButton');
const urlInput = document.querySelector('#resourceUrl');
const message = document.querySelector('#formMessage');

function configuredFields() {
  const groups = new Map();
  document.querySelectorAll('[data-field-id]').forEach(control => {
    const id = control.dataset.fieldId;
    if (!id) return;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(control);
  });
  return [...groups.entries()].map(([id, controls]) => {
    const first = controls[0];
    const container = first.closest('.field');
    const name = container?.querySelector('legend')?.textContent?.trim()
      || container?.childNodes?.[0]?.textContent?.trim()
      || 'Campo';
    const isMulti = first.type === 'checkbox';
    const options = isMulti
      ? controls.map(control => ({ id: control.value, label: control.parentElement?.textContent?.trim() || control.value }))
      : [...first.options].filter(option => option.value).map(option => ({ id: option.value, label: option.textContent.trim() }));
    return { id, name, fieldType: isMulti ? 'multi_select' : 'single_select', options };
  });
}

function applyFieldValues(values = []) {
  for (const suggestion of values) {
    const controls = [...document.querySelectorAll(`[data-field-id="${CSS.escape(suggestion.fieldId)}"]`)];
    if (!controls.length) continue;
    const selected = new Set(suggestion.optionIds || []);
    if (controls[0].type === 'checkbox') controls.forEach(control => { control.checked = selected.has(control.value); });
    else {
      const value = [...selected][0];
      if (value && [...controls[0].options].some(option => option.value === value)) controls[0].value = value;
    }
  }
}

function normalizeTag(value) {
  return String(value || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ')
    .replace(/^[,.;:!?()\[\]{}"']+|[,.;:!?()\[\]{}"']+$/g, '');
}

function thematicTags(result) {
  const blocked = new Set(['recurso','enlace','página','video','vídeo','documento','tutorial','guía','contenido','información','educación','tecnología']);
  const tags = [];
  const seen = new Set();
  (Array.isArray(result.tags) ? result.tags : []).forEach(value => {
    const tag = normalizeTag(value);
    const key = tag.toLocaleLowerCase('es');
    if (!tag || blocked.has(key) || seen.has(key) || tag.length > 50) return;
    seen.add(key);
    tags.push(tag);
  });
  return tags.slice(0, 8);
}

function metadataScore(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const generic = /^(recurso|contenido|información|página web|documento|vídeo|video|tutorial)(\s|$)/i.test(text);
  const meaningfulWords = text.split(/\s+/).filter(word => word.length > 3).length;
  return (generic ? -20 : 0) + Math.min(text.length, 180) + meaningfulWords * 8;
}

function chooseBetter(current, suggested) {
  const existing = String(current || '').trim();
  const candidate = String(suggested || '').trim();
  if (!candidate) return existing;
  return metadataScore(candidate) > metadataScore(existing) + 8 ? candidate : existing || candidate;
}

function youtubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      return url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || '';
    }
  } catch {}
  return '';
}

function resolveThumbnail(result) {
  const input = document.querySelector('#thumbnailUrl');
  const existing = input?.value.trim();
  if (existing) return existing;
  if (result.thumbnailUrl && /^https?:\/\//i.test(result.thumbnailUrl)) return result.thumbnailUrl;
  const videoId = youtubeVideoId(urlInput.value.trim());
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : '';
}

function updateThumbnailPreview(thumbnailUrl, result) {
  if (!thumbnailUrl) return;
  const preview = document.querySelector('#metadataPreview');
  if (!preview) return;
  preview.hidden = false;
  preview.replaceChildren();
  const image = document.createElement('img');
  image.src = thumbnailUrl;
  image.alt = '';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = document.querySelector('#title')?.value || result.title || 'Recurso reconocido';
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = `${result.provider || document.querySelector('#provider')?.value || 'Enlace'} · ${result.resourceType || document.querySelector('#resourceType')?.value || 'link'}`;
  copy.append(title, meta);
  preview.append(image, copy);
}

function applySuggestions(result) {
  const titleInput = document.querySelector('#title');
  const descriptionInput = document.querySelector('#description');
  titleInput.value = chooseBetter(titleInput.value, result.title);
  descriptionInput.value = chooseBetter(descriptionInput.value, result.description);
  if (result.provider) document.querySelector('#provider').value = result.provider;
  if (result.resourceType) document.querySelector('#resourceType').value = result.resourceType;

  const thumbnailUrl = resolveThumbnail(result);
  if (thumbnailUrl) {
    document.querySelector('#thumbnailUrl').value = thumbnailUrl;
    updateThumbnailPreview(thumbnailUrl, result);
  }

  const tags = thematicTags(result);
  const tagInput = document.querySelector('#tags');
  tagInput.value = tags.join(', ');
  applyFieldValues(result.fieldValues);
  return { tagCount: tags.length, hasThumbnail: Boolean(thumbnailUrl) };
}

async function completeWithGemini(button) {
  const url = urlInput.value.trim();
  if (!url || !groupSelect.value) return;
  button.disabled = true;
  inspectButton.disabled = true;
  message.textContent = /\.pdf(?:$|[?#])/i.test(url) || document.querySelector('#resourceType').value === 'pdf'
    ? 'Gemini está leyendo el PDF y preparando sugerencias…'
    : 'Gemini está analizando el tema concreto del recurso…';
  try {
    const result = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/resources/enrich`, {
      method: 'POST',
      body: JSON.stringify({
        url,
        title: document.querySelector('#title').value.trim(),
        description: document.querySelector('#description').value.trim(),
        provider: document.querySelector('#provider').value.trim(),
        resourceType: document.querySelector('#resourceType').value,
        mimeType: '',
        fields: configuredFields()
      })
    });
    const applied = applySuggestions(result);
    const thumbnailText = applied.hasThumbnail ? ' y miniatura' : '';
    message.textContent = `Sugerencias específicas de Gemini aplicadas (${result.model}), incluidas ${applied.tagCount} etiquetas${thumbnailText}. Revisa los campos antes de guardar.`;
    document.querySelector('#title')?.focus();
  } catch (error) {
    message.textContent = `${error.message} El reconocimiento normal sigue disponible.`;
  } finally {
    button.disabled = false;
    inspectButton.disabled = false;
  }
}

if (inspectButton) {
  const button = document.createElement('button');
  button.id = 'geminiButton';
  button.className = 'button button-secondary';
  button.type = 'button';
  button.textContent = 'Completar con Gemini';
  inspectButton.insertAdjacentElement('afterend', button);
  button.addEventListener('click', async () => {
    if (!urlInput.value.trim()) return;
    if (!document.querySelector('#title').value.trim()) {
      inspectButton.click();
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    await completeWithGemini(button);
  });
}
