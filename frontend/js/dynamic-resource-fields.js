import { api } from './api.js';

export async function renderDynamicResourceFields({ groupId, container, values = {} }) {
  if (!groupId || !container) return [];
  const fields = await api(`/api/v1/groups/${groupId}/fields`);
  container.replaceChildren();

  for (const field of fields) {
    const label = document.createElement('label');
    label.className = 'field';
    label.dataset.fieldId = field.id;

    const caption = document.createElement('span');
    caption.textContent = `${field.name}${field.isRequired ? ' *' : ''}`;
    label.append(caption);

    if (field.fieldType === 'multi_select') {
      const select = document.createElement('select');
      select.multiple = true;
      select.required = field.isRequired;
      select.name = `custom-${field.id}`;
      for (const option of field.options || []) {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.label;
        item.selected = (values[field.id] || []).includes(option.id);
        select.append(item);
      }
      label.append(select);
    } else if (field.fieldType === 'single_select') {
      const select = document.createElement('select');
      select.required = field.isRequired;
      select.name = `custom-${field.id}`;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = `Sin ${field.name.toLowerCase()}`;
      select.append(empty);
      for (const option of field.options || []) {
        const item = document.createElement('option');
        item.value = option.id;
        item.textContent = option.label;
        item.selected = (values[field.id] || []).includes(option.id);
        select.append(item);
      }
      label.append(select);
    }

    container.append(label);
  }
  return fields;
}

export function collectDynamicResourceFields(container) {
  const result = {};
  for (const label of container?.querySelectorAll('[data-field-id]') || []) {
    const fieldId = label.dataset.fieldId;
    const select = label.querySelector('select');
    if (!select) continue;
    const selected = Array.from(select.selectedOptions).map(option => option.value).filter(Boolean);
    if (selected.length) result[fieldId] = selected;
  }
  return result;
}
