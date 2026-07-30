const form = document.querySelector('#linkForm');
const input = document.querySelector('#musicUrl');
const result = document.querySelector('#linkResult');
const installButton = document.querySelector('#installButton');

let deferredInstallPrompt;

function detectLink(rawUrl) {
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'open.spotify.com') {
    const [type = 'unknown', id = ''] = url.pathname.split('/').filter(Boolean);
    return { platform: 'Spotify', type, id };
  }

  if (['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)) {
    const isPlaylist = url.searchParams.has('list') && !url.searchParams.has('v');
    return {
      platform: host === 'music.youtube.com' ? 'YouTube Music' : 'YouTube',
      type: isPlaylist ? 'playlist' : 'video',
      id: host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.searchParams.get('list') || ''
    };
  }

  return { platform: 'Otro', type: 'link', id: '' };
}

function showInspection(url) {
  const inspection = detectLink(url);
  result.hidden = false;
  result.innerHTML = `<strong>${inspection.platform}</strong><br>Tipo detectado: ${inspection.type}.<br><small>La siguiente iteración permitirá completar género, comentario y grupo.</small>`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    showInspection(input.value.trim());
  } catch {
    result.hidden = false;
    result.textContent = 'El enlace no tiene un formato válido.';
  }
});

const sharedUrl = new URLSearchParams(location.search).get('url');
if (sharedUrl) {
  input.value = sharedUrl;
  showInspection(sharedUrl);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = undefined;
  installButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
