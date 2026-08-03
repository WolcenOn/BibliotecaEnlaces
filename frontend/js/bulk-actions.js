import './share-consumer.js';

const resourceList = document.querySelector('#resourceList');
const selectionBar = document.querySelector('#selectionBar');
const selectedCount = document.querySelector('#selectedCount');
const selectionMessage = document.querySelector('#selectionMessage');
const selectedIds = new Set();

const downloadableExtensions = /\.(pdf|doc|docx|odt|rtf|txt|xls|xlsx|ods|csv|ppt|pptx|odp|zip|rar|7z)(?:$|[?#])/i;

function cardData(card) {
  const link = card.querySelector('.music-copy h3 a');
  const eyebrow = card.querySelector('.eyebrow')?.textContent || '';
  return {
    id: card.dataset.id || '',
    url: link?.href || '',
    title: link?.textContent?.trim() || 'recurso',
    meta: eyebrow.toLowerCase()
  };
}

function youtubeVideoId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
      return match?.[1] || '';
    }
  } catch {}
  return '';
}

function isDownloadable(item) {
  return downloadableExtensions.test(item.url) || /pdf|documento|hoja de cálculo|presentación|spreadsheet/.test(item.meta);
}

function decorateCards() {
  for (const card of resourceList.querySelectorAll('.music-card')) {
    if (card.querySelector('.select-item')) continue;
    const item = cardData(card);
    const label = document.createElement('label');
    label.className = 'select-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selectedIds.has(item.id);
    input.dataset.selectResource = item.id;
    const text = document.createElement('span');
    text.textContent = 'Seleccionar';
    label.append(input, text);
    card.prepend(label);
  }
  updateSelectionUI();
}

function selectedItems() {
  return [...resourceList.querySelectorAll('.music-card')]
    .map(cardData)
    .filter(item => selectedIds.has(item.id));
}

function updateSelectionUI() {
  const count = selectedIds.size;
  selectedCount.textContent = String(count);
  selectionBar.hidden = false;
  document.querySelector('#sendYoutube').disabled = count === 0;
  document.querySelector('#downloadSelected').disabled = count === 0;
  document.querySelector('#copySelected').disabled = count === 0;
  document.querySelector('#clearSelection').disabled = count === 0;
}

function clearSelection(message = '') {
  selectedIds.clear();
  for (const input of resourceList.querySelectorAll('[data-select-resource]')) input.checked = false;
  selectionMessage.textContent = message;
  updateSelectionUI();
}

resourceList.addEventListener('change', event => {
  const input = event.target.closest('[data-select-resource]');
  if (!input) return;
  if (input.checked) selectedIds.add(input.dataset.selectResource);
  else selectedIds.delete(input.dataset.selectResource);
  selectionMessage.textContent = '';
  updateSelectionUI();
});

document.querySelector('#selectVisible').addEventListener('click', () => {
  const cards = [...resourceList.querySelectorAll('.music-card')];
  for (const card of cards) {
    const id = card.dataset.id;
    if (id) selectedIds.add(id);
    const input = card.querySelector('[data-select-resource]');
    if (input) input.checked = true;
  }
  selectionMessage.textContent = `${cards.length} resultados visibles seleccionados.`;
  updateSelectionUI();
});

document.querySelector('#clearSelection').addEventListener('click', () => clearSelection());

document.querySelector('#copySelected').addEventListener('click', async () => {
  const items = selectedItems();
  if (!items.length) return;
  try {
    await navigator.clipboard.writeText(items.map(item => item.url).join('\n'));
    selectionMessage.textContent = `${items.length} enlaces copiados.`;
  } catch {
    selectionMessage.textContent = 'El navegador no permitió copiar automáticamente.';
  }
});

document.querySelector('#sendYoutube').addEventListener('click', () => {
  const ids = selectedItems().map(item => youtubeVideoId(item.url)).filter(Boolean);
  if (!ids.length) {
    selectionMessage.textContent = 'La selección no contiene vídeos reconocibles de YouTube.';
    return;
  }
  const queueUrl = `https://www.youtube.com/watch_videos?video_ids=${encodeURIComponent(ids.join(','))}`;
  window.open(queueUrl, '_blank', 'noopener,noreferrer');
  selectionMessage.textContent = `Abierta una cola temporal de YouTube con ${ids.length} vídeos. Para guardarla permanentemente, usa Guardar en YouTube.`;
});

document.querySelector('#downloadSelected').addEventListener('click', () => {
  const files = selectedItems().filter(isDownloadable);
  if (!files.length) {
    selectionMessage.textContent = 'No hay PDFs ni documentos descargables en la selección.';
    return;
  }

  files.forEach((item, index) => {
    window.setTimeout(() => {
      const link = document.createElement('a');
      link.href = item.url;
      link.download = '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.append(link);
      link.click();
      link.remove();
    }, index * 350);
  });
  selectionMessage.textContent = `Solicitada la descarga de ${files.length} archivos. El navegador puede pedir permiso para descargas múltiples o abrir algunos documentos en pestañas nuevas.`;
});

const observer = new MutationObserver(decorateCards);
observer.observe(resourceList, { childList: true });
decorateCards();
