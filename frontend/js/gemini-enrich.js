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
    return {
      id,
      name,
      fieldType: isMulti ? 'multi_select' : 'single_select',
      options
    };
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

function applySuggestions(result) {
  if (result.title) document.querySelector('#title').value = result.title;
  if (result.description) document.querySelector('#description').value = result.description;
  if (result.provider) document.querySelector('#provider').value = result.provider;
  if (result.resourceType) document.querySelector('#resourceType').value = result.resourceType;
  if (Array.isArray(result.tags) && result.tags.length) document.querySelector('#tags').value = result.tags.join(', ');
  applyFieldValues(result.fieldValues);
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
    applySuggestions(result);
    message.textContent = `Sugerencias de Gemini aplicadas (${result.model}). Revisa los campos antes de guardar.`;
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
