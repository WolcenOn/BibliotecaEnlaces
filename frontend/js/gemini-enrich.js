import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const inspectButton = document.querySelector('#inspectButton');
const urlInput = document.querySelector('#resourceUrl');
const message = document.querySelector('#formMessage');

const tagStopWords = new Set([
  'para', 'como', 'desde', 'hasta', 'sobre', 'entre', 'hacia', 'este', 'esta', 'estos', 'estas',
  'esto', 'esa', 'ese', 'esos', 'esas', 'aquel', 'aquella', 'the', 'and', 'with', 'from', 'that',
  'una', 'uno', 'unos', 'unas', 'del', 'las', 'los', 'por', 'con', 'sin', 'que', 'sus', 'son',
  'más', 'muy', 'también', 'puede', 'pueden', 'cómo', 'guía', 'tutorial', 'curso', 'video', 'vídeo',
  'documento', 'recurso', 'enlace', 'página', 'introducción', 'información', 'contenido', 'ejemplo'
]);

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
    if (controls[0].type === 'checkbox') {
      controls.forEach(control => { control.checked = selected.has(control.value); });
    } else {
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
  const tags = [];
  const seen = new Set();
  const add = value => {
    const tag = normalizeTag(value);
    const key = tag.toLocaleLowerCase('es');
    if (!tag || tag.length < 3 || tag.length > 45 || tagStopWords.has(key) || seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  };

  (Array.isArray(result.tags) ? result.tags : []).forEach(add);
  const source = `${result.title || ''} ${result.description || ''}`.normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}+#.\-]+/gu, ' ');
  const words = source.split(/\s+/).map(normalizeTag).filter(Boolean);
  const frequencies = new Map();
  for (const word of words) {
    const key = word.toLocaleLowerCase('es');
    if (word.length < 4 || tagStopWords.has(key) || /^\d+$/.test(word)) continue;
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }
  [...frequencies.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .forEach(([word]) => { if (tags.length < 10) add(word); });

  for (const suggestion of result.fieldValues || []) {
    for (const optionId of suggestion.optionIds || []) {
      const option = document.querySelector(`[data-field-id="${CSS.escape(suggestion.fieldId)}"] option[value="${CSS.escape(optionId)}"]`);
      const checkbox = document.querySelector(`[data-field-id="${CSS.escape(suggestion.fieldId)}"][value="${CSS.escape(optionId)}"]`);
      const label = option?.textContent?.trim() || checkbox?.parentElement?.textContent?.trim();
      if (label && tags.length < 12) add(label);
    }
  }
  return tags.slice(0, 12);
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
  title.textContent = result.title || document.querySelector('#title')?.value || 'Recurso reconocido';
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = `${result.provider || document.querySelector('#provider')?.value || 'Enlace'} · ${result.resourceType || document.querySelector('#resourceType')?.value || 'link'}`;
  copy.append(title, meta);
  preview.append(image, copy);
}

function applySuggestions(result) {
  if (result.title) document.querySelector('#title').value = result.title;
  if (result.description) document.querySelector('#description').value = result.description;
  if (result.provider) document.querySelector('#provider').value = result.provider;
  if (result.resourceType) document.querySelector('#resourceType').value = result.resourceType;

  const thumbnailUrl = resolveThumbnail(result);
  if (thumbnailUrl) {
    document.querySelector('#thumbnailUrl').value = thumbnailUrl;
    updateThumbnailPreview(thumbnailUrl, result);
  }

  const tags = thematicTags(result);
  const tagInput = document.querySelector('#tags');
  const existing = tagInput.value.split(',').map(normalizeTag).filter(Boolean);
  const merged = [];
  const seen = new Set();
  [...existing, ...tags].forEach(tag => {
    const key = tag.toLocaleLowerCase('es');
    if (!seen.has(key) && merged.length < 12) { seen.add(key); merged.push(tag); }
  });
  tagInput.value = merged.join(', ');
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
    : 'Gemini está analizando y clasificando el recurso…';

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
    message.textContent = `Sugerencias de Gemini aplicadas (${result.model}), incluidas ${applied.tagCount} etiquetas${thumbnailText}. Revisa los campos antes de guardar.`;
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
