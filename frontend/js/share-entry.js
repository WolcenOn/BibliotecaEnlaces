(() => {
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

  // Retira los parámetros para que una recarga no procese dos veces el mismo enlace.
  history.replaceState(null, '', `${location.pathname}${location.hash}`);
})();