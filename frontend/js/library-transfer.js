import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const exportButton = document.querySelector('#exportLibrary');
const chooseImport = document.querySelector('#chooseImport');
const fileInput = document.querySelector('#importLibraryFile');
const message = document.querySelector('#transferMessage');

const cleanName = value => String(value || 'biblioteca').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'biblioteca';
const normalize = value => String(value || '').trim().toLocaleLowerCase('es');

async function selectedGroup() {
  const groups = await api('/api/v1/groups');
  return groups.find(group => String(group.id) === String(groupSelect.value));
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function portableField(field) {
  return {
    name: field.name,
    fieldType: field.fieldType,
    isRequired: Boolean(field.isRequired),
    isFilterable: Boolean(field.isFilterable),
    options: (field.options || []).map(option => option.label)
  };
}

function portableResource(item) {
  return {
    url: item.url,
    title: item.title || item.url,
    description: item.description || '',
    resourceType: item.resourceType || 'link',
    provider: item.provider || '',
    mimeType: item.mimeType || '',
    thumbnailUrl: item.thumbnailUrl || '',
    originalComment: item.originalComment || '',
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}

async function exportLibrary() {
  if (!groupSelect.value) return;
  exportButton.disabled = true;
  message.textContent = 'Preparando archivo JSON…';
  try {
    const [group, fields, resources] = await Promise.all([
      selectedGroup(),
      api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/fields`),
      api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/resource-dashboard`)
    ]);
    const model = {
      format: 'biblioteca-enlaces',
      version: 1,
      exportedAt: new Date().toISOString(),
      library: { name: group?.name || 'Biblioteca' },
      fields: fields.map(portableField),
      resources: resources.map(portableResource)
    };
    downloadJSON(model, `${cleanName(group?.name)}-${new Date().toISOString().slice(0, 10)}.json`);
    message.textContent = `Exportados ${model.fields.length} campos y ${model.resources.length} recursos.`;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    exportButton.disabled = false;
  }
}

function validateModel(model) {
  if (!model || model.format !== 'biblioteca-enlaces' || model.version !== 1) throw new Error('El archivo no es un modelo compatible de Biblioteca de Enlaces.');
  if (!Array.isArray(model.fields) || !Array.isArray(model.resources)) throw new Error('El JSON no contiene campos y recursos válidos.');
  if (model.resources.length > 5000 || model.fields.length > 100) throw new Error('El modelo supera el límite permitido.');
}

async function importLibrary(file) {
  chooseImport.disabled = true;
  message.textContent = 'Leyendo modelo…';
  try {
    const model = JSON.parse(await file.text());
    validateModel(model);
    const group = await selectedGroup();
    if (!group || !['owner', 'admin'].includes(group.role)) throw new Error('Solo el propietario o un administrador puede importar modelos.');
    if (!confirm(`Se importarán ${model.fields.length} campos y ${model.resources.length} recursos en “${group.name}”. Los enlaces duplicados se omitirán. ¿Continuar?`)) return;

    let fieldsCreated = 0;
    const currentFields = await api(`/api/v1/groups/${encodeURIComponent(group.id)}/fields`);
    const existingFieldNames = new Set(currentFields.map(field => normalize(field.name)));
    for (const field of model.fields) {
      if (!field?.name || existingFieldNames.has(normalize(field.name))) continue;
      if (!['single_select', 'multi_select'].includes(field.fieldType)) continue;
      message.textContent = `Creando campos… ${fieldsCreated + 1}/${model.fields.length}`;
      await api(`/api/v1/groups/${encodeURIComponent(group.id)}/fields`, {
        method: 'POST',
        body: JSON.stringify({
          name: String(field.name).trim(),
          fieldType: field.fieldType,
          isRequired: Boolean(field.isRequired),
          isFilterable: Boolean(field.isFilterable),
          options: Array.isArray(field.options) ? field.options.map(value => String(value).trim()).filter(Boolean) : []
        })
      });
      existingFieldNames.add(normalize(field.name));
      fieldsCreated += 1;
    }

    const currentResources = await api(`/api/v1/groups/${encodeURIComponent(group.id)}/resource-dashboard`);
    const existingUrls = new Set(currentResources.map(item => String(item.url || '').trim().toLowerCase()));
    let resourcesCreated = 0;
    let skipped = 0;
    for (const resource of model.resources) {
      const url = String(resource?.url || '').trim();
      if (!/^https?:\/\//i.test(url) || existingUrls.has(url.toLowerCase())) { skipped += 1; continue; }
      message.textContent = `Importando recursos… ${resourcesCreated + skipped + 1}/${model.resources.length}`;
      await api(`/api/v1/groups/${encodeURIComponent(group.id)}/resources`, {
        method: 'POST',
        body: JSON.stringify({
          url,
          normalizedUrl: url,
          finalUrl: url,
          title: String(resource.title || url).trim(),
          description: String(resource.description || '').trim(),
          resourceType: String(resource.resourceType || 'link'),
          provider: String(resource.provider || '').trim(),
          mimeType: String(resource.mimeType || '').trim(),
          thumbnailUrl: String(resource.thumbnailUrl || '').trim(),
          originalComment: String(resource.originalComment || '').trim(),
          sourceType: 'json_import',
          fieldValues: {},
          tags: Array.isArray(resource.tags) ? resource.tags.map(value => String(value).trim()).filter(Boolean) : []
        })
      });
      existingUrls.add(url.toLowerCase());
      resourcesCreated += 1;
    }
    message.textContent = `Importación completada: ${fieldsCreated} campos y ${resourcesCreated} recursos creados; ${skipped} enlaces omitidos.`;
    window.setTimeout(() => location.reload(), 900);
  } catch (error) {
    message.textContent = error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message;
  } finally {
    chooseImport.disabled = false;
    fileInput.value = '';
  }
}

exportButton?.addEventListener('click', exportLibrary);
chooseImport?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) importLibrary(file);
});
