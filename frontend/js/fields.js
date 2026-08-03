import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const fieldForm = document.querySelector('#fieldForm');
const fieldsList = document.querySelector('#fieldsList');
const fieldMessage = document.querySelector('#fieldMessage');
const templateMessage = document.querySelector('#templateMessage');
const applyAsirTemplate = document.querySelector('#applyAsirTemplate');

let groups = [];
let currentFields = [];

const ASIR_TEMPLATE = [
  {
    name: 'Asignatura',
    fieldType: 'single_select',
    isRequired: true,
    isFilterable: true,
    options: [
      'Administración de Sistemas Operativos',
      'Servicios de Red e Internet',
      'Implantación de Aplicaciones Web',
      'Administración de Sistemas Gestores de Bases de Datos',
      'Seguridad y Alta Disponibilidad',
      'Itinerario Personal para la Empleabilidad II',
      'Digitalización aplicada a los sectores productivos',
      'Proyecto intermodular',
      'Optativa'
    ]
  },
  {
    name: 'Tema técnico',
    fieldType: 'multi_select',
    isRequired: false,
    isFilterable: true,
    options: [
      'Linux',
      'Windows Server',
      'PowerShell',
      'Bash y automatización',
      'Usuarios, grupos y permisos',
      'DNS',
      'DHCP',
      'HTTP, HTTPS y TLS',
      'Apache y Nginx',
      'Correo electrónico',
      'FTP, SFTP y almacenamiento',
      'LDAP y directorio activo',
      'Virtualización',
      'Contenedores y Docker',
      'Alta disponibilidad y balanceo',
      'Copias de seguridad y recuperación',
      'Monitorización y registros',
      'Firewalls, VPN y acceso remoto',
      'Criptografía y certificados',
      'Hardening y auditoría',
      'MySQL y MariaDB',
      'PostgreSQL',
      'Oracle',
      'Administración y optimización SQL',
      'PHP y aplicaciones web',
      'CMS',
      'Git y despliegue',
      'Cloud y servicios administrados'
    ]
  },
  {
    name: 'Tipo de material',
    fieldType: 'single_select',
    isRequired: false,
    isFilterable: true,
    options: [
      'Apuntes',
      'Documentación oficial',
      'Tutorial',
      'Práctica',
      'Laboratorio',
      'Ejercicio resuelto',
      'Chuleta o referencia rápida',
      'Examen',
      'Proyecto',
      'Herramienta'
    ]
  },
  {
    name: 'Dificultad',
    fieldType: 'single_select',
    isRequired: false,
    isFilterable: true,
    options: ['Básico', 'Intermedio', 'Avanzado']
  }
];

function selectedGroupId() {
  return groupSelect.value;
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function renderFields(fields) {
  currentFields = fields;
  fieldsList.replaceChildren();
  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Esta biblioteca está vacía. Crea un campo o carga una plantilla.';
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

async function createField(groupId, field) {
  return api(`/api/v1/groups/${groupId}/fields`, {
    method: 'POST',
    body: JSON.stringify(field)
  });
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
    await createField(groupId, {
      name: document.querySelector('#fieldName').value.trim(),
      fieldType: document.querySelector('#fieldType').value,
      isRequired: document.querySelector('#fieldRequired').checked,
      isFilterable: document.querySelector('#fieldFilterable').checked,
      options
    });
    fieldForm.reset();
    document.querySelector('#fieldFilterable').checked = true;
    fieldMessage.textContent = 'Campo creado.';
    await loadFields();
  } catch (error) {
    fieldMessage.textContent = error.message;
  }
});

applyAsirTemplate?.addEventListener('click', async () => {
  const groupId = selectedGroupId();
  if (!groupId) return;

  const group = groups.find(item => item.id === groupId);
  if (!group || !['owner', 'admin'].includes(group.role)) {
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
  templateMessage.textContent = `Creando ${missing.length} campos…`;
  let created = 0;

  try {
    for (const field of missing) {
      await createField(groupId, field);
      created += 1;
      templateMessage.textContent = `Creando plantilla… ${created}/${missing.length}`;
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

loadGroups().catch(error => {
  fieldMessage.textContent = error.message;
});
