import { api } from './api.js';

const groupSelect = document.querySelector('#groupSelect');
const exportButton = document.querySelector('#exportLibrary');
const exportSchemaButton = document.querySelector('#exportSchema');
const chooseImport = document.querySelector('#chooseImport');
const fileInput = document.querySelector('#importLibraryFile');
const message = document.querySelector('#transferMessage');

const cleanName = value => String(value || 'biblioteca').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'biblioteca';
const normalize = value => String(value || '').trim().toLocaleLowerCase('es');

async function selectedGroup() {
  const groups = await api('/api/v1/groups');
  return groups.find(group => String(group.id) === String(groupSelect?.value));
}

function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function portableField(field) {
  return {
    name: String(field?.name || '').trim(),
    fieldType: field?.fieldType === 'multi_select' ? 'multi_select' : 'single_select',
    isRequired: Boolean(field?.isRequired),
    isFilterable: Boolean(field?.isFilterable),
    options: Array.isArray(field?.options)
      ? field.options.map(option => String(option?.label || '').trim()).filter(Boolean)
      : []
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

async function exportModel(kind) {
  if (!groupSelect?.value) {
    message.textContent = 'Selecciona una biblioteca antes de exportar.';
    return;
  }
  const button = kind === 'schema' ? exportSchemaButton : exportButton;
  if (!button) {
    message.textContent = 'No se encontró el botón de exportación. Recarga la aplicación.';
    return;
  }

  button.disabled = true;
  message.textContent = kind === 'schema' ? 'Preparando plantilla de estructura…' : 'Preparando copia completa…';
  try {
    const group = await selectedGroup();
    if (!group) throw new Error('No se pudo identificar la biblioteca seleccionada.');

    const fields = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/fields`);
    const portableFields = Array.isArray(fields) ? fields.map(portableField).filter(field => field.name) : [];
    const model = {
      format: 'biblioteca-enlaces',
      version: 2,
      kind,
      exportedAt: new Date().toISOString(),
      library: { name: group.name || 'Biblioteca' },
      schema: { fields: portableFields }
    };

    if (kind === 'full') {
      const resources = await api(`/api/v1/groups/${encodeURIComponent(groupSelect.value)}/resource-dashboard`);
      model.resources = Array.isArray(resources) ? resources.map(portableResource) : [];
    }

    const suffix = kind === 'schema' ? 'estructura' : 'completa';
    downloadJSON(model, `${cleanName(group.name)}-${suffix}-${new Date().toISOString().slice(0, 10)}.json`);
    message.textContent = kind === 'schema'
      ? `Estructura exportada correctamente: ${portableFields.length} campos.`
      : `Copia exportada: ${portableFields.length} campos y ${model.resources.length} recursos.`;
  } catch (error) {
    message.textContent = `No se pudo exportar: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function normalizeModel(model) {
  if (!model || model.format !== 'biblioteca-enlaces') throw new Error('El archivo no es compatible con Biblioteca de Enlaces.');
  if (model.version === 1) return { kind: 'full', fields: Array.isArray(model.fields) ? model.fields : [], resources: Array.isArray(model.resources) ? model.resources : [] };
  if (model.version !== 2 || !['schema', 'full'].includes(model.kind)) throw new Error('La versión o el tipo de modelo no es compatible.');
  const fields = Array.isArray(model.schema?.fields) ? model.schema.fields : [];
  const resources = model.kind === 'full' && Array.isArray(model.resources) ? model.resources : [];
  return { kind: model.kind, fields, resources };
}

function validateModel(model) {
  if (model.fields.length > 100) throw new Error('La plantilla supera el límite de 100 campos.');
  if (model.resources.length > 5000) throw new Error('La copia supera el límite de 5.000 recursos.');
}

async function importLibrary(file) {
  chooseImport.disabled = true;
  message.textContent = 'Leyendo archivo JSON…';
  try {
    const parsed = JSON.parse(await file.text());
    const model = normalizeModel(parsed);
    validateModel(model);
    const group = await selectedGroup();
    if (!group || !['owner', 'admin'].includes(group.role)) throw new Error('Solo el propietario o un administrador puede importar modelos.');
    const detail = model.kind === 'schema' ? `${model.fields.length} campos de estructura` : `${model.fields.length} campos y ${model.resources.length} recursos`;
    if (!confirm(`Se importarán ${detail} en “${group.name}”. Los elementos existentes se conservarán y los duplicados se omitirán. ¿Continuar?`)) return;

    let fieldsCreated = 0;
    const currentFields = await api(`/api/v1/groups/${encodeURIComponent(group.id)}/fields`);
    const existingFieldNames = new Set(currentFields.map(field => normalize(field.name)));
    for (const field of model.fields) {
      if (!field?.name || existingFieldNames.has(normalize(field.name))) continue;
      if (!['single_select', 'multi_select'].includes(field.fieldType)) continue;
      message.textContent = `Creando estructura… ${fieldsCreated + 1}/${model.fields.length}`;
      await api(`/api/v1/groups/${encodeURIComponent(group.id)}/fields`, { method: 'POST', body: JSON.stringify({ name: String(field.name).trim(), fieldType: field.fieldType, isRequired: Boolean(field.isRequired), isFilterable: Boolean(field.isFilterable), options: Array.isArray(field.options) ? field.options.map(value => String(value).trim()).filter(Boolean) : [] }) });
      existingFieldNames.add(normalize(field.name));
      fieldsCreated += 1;
    }

    let resourcesCreated = 0;
    let skipped = 0;
    if (model.kind === 'full') {
      const currentResources = await api(`/api/v1/groups/${encodeURIComponent(group.id)}/resource-dashboard`);
      const existingUrls = new Set(currentResources.map(item => String(item.url || '').trim().toLowerCase()));
      for (const resource of model.resources) {
        const url = String(resource?.url || '').trim();
        if (!/^https?:\/\//i.test(url) || existingUrls.has(url.toLowerCase())) { skipped += 1; continue; }
        message.textContent = `Importando recursos… ${resourcesCreated + skipped + 1}/${model.resources.length}`;
        await api(`/api/v1/groups/${encodeURIComponent(group.id)}/resources`, { method: 'POST', body: JSON.stringify({ url, normalizedUrl: url, finalUrl: url, title: String(resource.title || url).trim(), description: String(resource.description || '').trim(), resourceType: String(resource.resourceType || 'link'), provider: String(resource.provider || '').trim(), mimeType: String(resource.mimeType || '').trim(), thumbnailUrl: String(resource.thumbnailUrl || '').trim(), originalComment: String(resource.originalComment || '').trim(), sourceType: 'json_import', fieldValues: {}, tags: Array.isArray(resource.tags) ? resource.tags.map(value => String(value).trim()).filter(Boolean) : [] }) });
        existingUrls.add(url.toLowerCase());
        resourcesCreated += 1;
      }
    }

    message.textContent = model.kind === 'schema' ? `Plantilla aplicada: ${fieldsCreated} campos nuevos.` : `Importación completada: ${fieldsCreated} campos y ${resourcesCreated} recursos creados; ${skipped} enlaces omitidos.`;
    window.setTimeout(() => location.reload(), 900);
  } catch (error) {
    message.textContent = error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message;
  } finally {
    chooseImport.disabled = false;
    fileInput.value = '';
  }
}

exportButton?.addEventListener('click', () => exportModel('full'));
exportSchemaButton?.addEventListener('click', () => exportModel('schema'));
chooseImport?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) importLibrary(file);
});
