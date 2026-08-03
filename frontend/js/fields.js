import { api } from './api.js';

const $ = selector => document.querySelector(selector);
const groupSelect = $('#groupSelect');
const fieldForm = $('#fieldForm');
const fieldsList = $('#fieldsList');
const fieldMessage = $('#fieldMessage');
const templateMessage = $('#templateMessage');
const applyAsirTemplate = $('#applyAsirTemplate');
const editDialog = $('#editFieldDialog');

let groups = [];
let currentFields = [];

const ASIR_TEMPLATE = [
  { name:'Asignatura', fieldType:'single_select', isRequired:true, isFilterable:true, options:['Administración de Sistemas Operativos','Servicios de Red e Internet','Implantación de Aplicaciones Web','Administración de Sistemas Gestores de Bases de Datos','Seguridad y Alta Disponibilidad','Itinerario Personal para la Empleabilidad II','Digitalización aplicada a los sectores productivos','Proyecto intermodular','Optativa'] },
  { name:'Tema técnico', fieldType:'multi_select', isRequired:false, isFilterable:true, options:['Linux','Windows Server','PowerShell','Bash y automatización','Usuarios, grupos y permisos','DNS','DHCP','HTTP, HTTPS y TLS','Apache y Nginx','Correo electrónico','FTP, SFTP y almacenamiento','LDAP y directorio activo','Virtualización','Contenedores y Docker','Alta disponibilidad y balanceo','Copias de seguridad y recuperación','Monitorización y registros','Firewalls, VPN y acceso remoto','Criptografía y certificados','Hardening y auditoría','MySQL y MariaDB','PostgreSQL','Oracle','Administración y optimización SQL','PHP y aplicaciones web','CMS','Git y despliegue','Cloud y servicios administrados'] },
  { name:'Tipo de material', fieldType:'single_select', isRequired:false, isFilterable:true, options:['Apuntes','Documentación oficial','Tutorial','Práctica','Laboratorio','Ejercicio resuelto','Chuleta o referencia rápida','Examen','Proyecto','Herramienta'] },
  { name:'Dificultad', fieldType:'single_select', isRequired:false, isFilterable:true, options:['Básico','Intermedio','Avanzado'] }
];

const selectedGroupId = () => groupSelect.value;
const normalize = value => String(value || '').trim().toLocaleLowerCase('es');
const selectedGroup = () => groups.find(group => group.id === selectedGroupId());
const canManage = () => ['owner','admin'].includes(selectedGroup()?.role);

function renderFields(fields) {
  currentFields = fields;
  fieldsList.replaceChildren();
  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Esta biblioteca está vacía. Crea un campo o carga una plantilla.';
    fieldsList.append(empty);
    return;
  }

  for (const field of fields) {
    const article = document.createElement('article');
    article.className = 'field-structure-card';
    article.dataset.fieldId = field.id;

    const copy = document.createElement('div');
    copy.className = 'field-structure-copy';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = field.fieldType === 'multi_select' ? 'Selección múltiple' : 'Selección única';
    const title = document.createElement('h3');
    title.textContent = field.name;
    const details = document.createElement('p');
    details.className = 'muted';
    details.textContent = `${field.isRequired ? 'Obligatorio' : 'Opcional'} · ${field.isFilterable ? 'Disponible como filtro' : 'No filtrable'}`;
    const options = document.createElement('p');
    options.className = 'field-option-summary';
    options.textContent = field.options?.length ? field.options.map(option => option.label).join(' · ') : 'Sin opciones todavía';
    copy.append(eyebrow, title, details, options);

    const actions = document.createElement('div');
    actions.className = 'field-card-actions';
    if (canManage()) {
      const edit = document.createElement('button');
      edit.className = 'button button-secondary';
      edit.type = 'button';
      edit.dataset.editField = field.id;
      edit.textContent = 'Editar';
      actions.append(edit);
    }

    article.append(copy, actions);
    fieldsList.append(article);
  }
}

async function loadFields() {
  if (!selectedGroupId()) return renderFields([]);
  try {
    renderFields(await api(`/api/v1/groups/${selectedGroupId()}/fields`));
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
    option.textContent = `${group.name}${['owner','admin'].includes(group.role) ? ' · administración' : ''}`;
    groupSelect.append(option);
  }
  await loadFields();
}

function createField(groupId, field) {
  return api(`/api/v1/groups/${groupId}/fields`, { method:'POST', body:JSON.stringify(field) });
}

function openEditor(fieldId) {
  const field = currentFields.find(item => item.id === fieldId);
  if (!field) return;
  $('#editFieldId').value = field.id;
  $('#editFieldName').value = field.name;
  $('#editFieldType').value = field.fieldType;
  $('#editFieldRequired').checked = field.isRequired;
  $('#editFieldFilterable').checked = field.isFilterable;
  $('#editFieldOptions').value = (field.options || []).map(option => option.label).join('\n');
  $('#editFieldOptions').dataset.optionIds = JSON.stringify((field.options || []).map(option => option.id));
  $('#editFieldMessage').textContent = '';
  editDialog.showModal();
}

function editorOptions() {
  const labels = $('#editFieldOptions').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const ids = JSON.parse($('#editFieldOptions').dataset.optionIds || '[]');
  return labels.map((label, index) => ({ id: ids[index] || '', label }));
}

groupSelect.addEventListener('change', loadFields);

fieldForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedGroupId()) return;
  fieldMessage.textContent = 'Guardando…';
  try {
    await createField(selectedGroupId(), {
      name: $('#fieldName').value.trim(),
      fieldType: $('#fieldType').value,
      isRequired: $('#fieldRequired').checked,
      isFilterable: $('#fieldFilterable').checked,
      options: $('#fieldOptions').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    });
    fieldForm.reset();
    $('#fieldFilterable').checked = true;
    fieldMessage.textContent = 'Campo creado.';
    await loadFields();
  } catch (error) {
    fieldMessage.textContent = error.message;
  }
});

fieldsList.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-field]');
  if (button) openEditor(button.dataset.editField);
});

$('#editFieldForm').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('#editFieldMessage');
  message.textContent = 'Guardando cambios…';
  try {
    await api(`/api/v1/groups/${selectedGroupId()}/fields/${$('#editFieldId').value}`, {
      method:'PATCH',
      body:JSON.stringify({
        name: $('#editFieldName').value.trim(),
        fieldType: $('#editFieldType').value,
        isRequired: $('#editFieldRequired').checked,
        isFilterable: $('#editFieldFilterable').checked,
        options: editorOptions()
      })
    });
    editDialog.close();
    fieldMessage.textContent = 'Campo actualizado.';
    await loadFields();
  } catch (error) {
    message.textContent = error.message;
  }
});

$('#deleteField').addEventListener('click', async () => {
  const field = currentFields.find(item => item.id === $('#editFieldId').value);
  if (!field || !confirm(`¿Retirar el campo “${field.name}”? Dejará de aparecer al guardar y filtrar, pero se conservarán los datos históricos.`)) return;
  $('#editFieldMessage').textContent = 'Retirando campo…';
  try {
    await api(`/api/v1/groups/${selectedGroupId()}/fields/${field.id}`, { method:'DELETE' });
    editDialog.close();
    fieldMessage.textContent = 'Campo retirado de la estructura.';
    await loadFields();
  } catch (error) {
    $('#editFieldMessage').textContent = error.message;
  }
});

$('#closeEditField').addEventListener('click', () => editDialog.close());
$('#cancelEditField').addEventListener('click', () => editDialog.close());

applyAsirTemplate.addEventListener('click', async () => {
  if (!canManage()) {
    templateMessage.textContent = 'Solo el propietario o un administrador puede cargar plantillas.';
    return;
  }
  const existingNames = new Set(currentFields.map(field => normalize(field.name)));
  const missing = ASIR_TEMPLATE.filter(field => !existingNames.has(normalize(field.name)));
  if (!missing.length) {
    templateMessage.textContent = 'La plantilla 2.º ASIR ya está cargada.';
    return;
  }
  applyAsirTemplate.disabled = true;
  let created = 0;
  try {
    for (const field of missing) {
      templateMessage.textContent = `Creando plantilla… ${created + 1}/${missing.length}`;
      await createField(selectedGroupId(), field);
      created += 1;
    }
    templateMessage.textContent = 'Plantilla 2.º ASIR cargada correctamente.';
    await loadFields();
  } catch (error) {
    templateMessage.textContent = `Se crearon ${created} campos. ${error.message}`;
    await loadFields();
  } finally {
    applyAsirTemplate.disabled = false;
  }
});

loadGroups().catch(error => { fieldMessage.textContent = error.message; });
