import { api } from './api.js';

const form = document.querySelector('#createLibraryForm');
const nameInput = document.querySelector('#newLibraryName');
const message = document.querySelector('#createLibraryMessage');
const groupSelect = document.querySelector('#groupSelect');

function addOrSelectGroup(group) {
  let option = [...groupSelect.options].find(item => String(item.value) === String(group.id));
  if (!option) {
    option = document.createElement('option');
    option.value = String(group.id);
    option.textContent = `${group.name || 'Biblioteca'} (${group.role || 'owner'})`;
    groupSelect.append(option);
  }
  groupSelect.value = String(group.id);
  groupSelect.dispatchEvent(new Event('change'));
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  message.textContent = 'Creando biblioteca…';

  try {
    await api('/api/v1/groups', {
      method: 'POST',
      body: JSON.stringify({ name })
    });

    const groups = await api('/api/v1/groups');
    const created = groups
      .filter(group => ['owner', 'admin'].includes(group.role))
      .find(group => String(group.name).trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));

    if (!created) throw new Error('La biblioteca se creó, pero no pudo seleccionarse automáticamente. Recarga la página.');

    addOrSelectGroup(created);
    nameInput.value = '';
    message.textContent = `Biblioteca “${created.name}” creada. Eres su propietario.`;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
