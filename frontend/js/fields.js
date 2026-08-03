import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const fieldForm = document.querySelector('#fieldForm');
const fieldsList = document.querySelector('#fieldsList');
const fieldMessage = document.querySelector('#fieldMessage');

let groups = [];

function selectedGroupId() {
  return groupSelect.value;
}

function renderFields(fields) {
  fieldsList.replaceChildren();
  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Todavía no hay campos personalizados.';
    fieldsList.append(empty);
    return;
  }

  for (const field of fields) {
    const article = document.createElement('article');
    article.className = 'panel panel-body';

    const heading = document.createElement('div');
    heading.className = 'section-heading';

    const text = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = field.fieldType === 'multi_select' ? 'Selección múltiple' : 'Selección única';
    const title = document.createElement('h3');
    title.textContent = field.name;
    const details = document.createElement('p');
    details.className = 'muted';
    details.textContent = `${field.isRequired ? 'Obligatorio' : 'Opcional'} · ${field.isFilterable ? 'Usado como filtro' : 'No filtrable'}`;
    text.append(eyebrow, title, details);

    const options = document.createElement('p');
    options.className = 'muted';
    options.textContent = field.options?.length
      ? field.options.map(option => option.label).join(' · ')
      : 'Sin opciones todavía';

    heading.append(text);
    article.append(heading, options);
    fieldsList.append(article);
  }
}

async function loadFields() {
  const groupId = selectedGroupId();
  if (!groupId) {
    renderFields([]);
    return;
  }
  try {
    const fields = await api(`/api/v1/groups/${groupId}/fields`);
    renderFields(fields);
  } catch (error) {
    fieldMessage.textContent = error.message;
  }
}

async function loadGroups() {
  groups = await api('/api/v1/groups');
  groupSelect.replaceChildren();
  for (const group of groups) {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = `${group.name}${group.role === 'owner' || group.role === 'admin' ? ' · administración' : ''}`;
    groupSelect.append(option);
  }
  await loadFields();
}

groupSelect.addEventListener('change', loadFields);

fieldForm.addEventListener('submit', async event => {
  event.preventDefault();
  const groupId = selectedGroupId();
  if (!groupId) return;

  fieldMessage.textContent = 'Guardando…';
  const options = document.querySelector('#fieldOptions').value
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean);

  try {
    await api(`/api/v1/groups/${groupId}/fields`, {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#fieldName').value.trim(),
        fieldType: document.querySelector('#fieldType').value,
        isRequired: document.querySelector('#fieldRequired').checked,
        isFilterable: document.querySelector('#fieldFilterable').checked,
        options
      })
    });
    fieldForm.reset();
    document.querySelector('#fieldFilterable').checked = true;
    fieldMessage.textContent = 'Campo creado.';
    await loadFields();
  } catch (error) {
    fieldMessage.textContent = error.message;
  }
});

loadGroups().catch(error => {
  fieldMessage.textContent = error.message;
});
