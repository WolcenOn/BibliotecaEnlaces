(() => {
  function captureShareFromURL() {
    const params = new URLSearchParams(location.search);
    const title = String(params.get('title') || '').trim();
    const text = String(params.get('text') || '').trim();
    const directURL = String(params.get('url') || '').trim();
    const candidates = [directURL, text, title].filter(Boolean);
    let url = '';

    for (const value of candidates) {
      const match = value.match(/https?:\/\/[^\s]+/i);
      if (match) {
        url = match[0].replace(/[),.;]+$/, '');
        break;
      }
    }

    if (!url) return;
    sessionStorage.setItem('bibliotecaPendingShare', JSON.stringify({
      url,
      title: title && !/^https?:\/\//i.test(title) ? title : '',
      text: text.replace(url, '').trim(),
      receivedAt: Date.now()
    }));
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
  }

  function readPendingShare() {
    const current = sessionStorage.getItem('bibliotecaPendingShare');
    const legacy = sessionStorage.getItem('musicDiscoveryPendingShare');
    if (!current && !legacy) return null;
    try {
      if (current) return JSON.parse(current);
      return { url: legacy, title: '', text: '', receivedAt: Date.now() };
    } catch {
      return null;
    }
  }

  function clearPendingShare() {
    sessionStorage.removeItem('bibliotecaPendingShare');
    sessionStorage.removeItem('musicDiscoveryPendingShare');
  }

  async function applyPendingShare() {
    captureShareFromURL();
    const pending = readPendingShare();
    if (!pending?.url) return;

    const started = Date.now();
    while (Date.now() - started < 15000) {
      const groupSelect = document.querySelector('#groupSelect');
      const urlInput = document.querySelector('#resourceUrl');
      const addPanel = document.querySelector('#addPanel');
      const inspectButton = document.querySelector('#inspectButton');
      const titleInput = document.querySelector('#title');
      const descriptionInput = document.querySelector('#description');
      const message = document.querySelector('#formMessage');
      const authBlocked = document.documentElement.classList.contains('auth-required');

      if (!authBlocked && groupSelect?.options.length && urlInput && addPanel && inspectButton) {
        addPanel.hidden = false;
        urlInput.value = pending.url;
        if (pending.title && titleInput && !titleInput.value) titleInput.value = pending.title;
        if (pending.text && descriptionInput && !descriptionInput.value) descriptionInput.value = pending.text;
        if (message) message.textContent = 'Enlace compartido recibido. Completando datos automáticamente…';

        addPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        clearPendingShare();
        inspectButton.click();
        window.setTimeout(() => titleInput?.focus(), 400);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPendingShare, { once: true });
  } else {
    applyPendingShare();
  }
})();