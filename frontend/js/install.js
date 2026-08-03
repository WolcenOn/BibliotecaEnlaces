const installButton = document.querySelector('#installButton');
const installHint = document.querySelector('#installHint');
let deferredPrompt;

const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isSamsungInternet = /SamsungBrowser/i.test(navigator.userAgent);
const isAndroid = /Android/i.test(navigator.userAgent);

function hideInstallUI() {
  if (installButton) installButton.hidden = true;
  if (installHint) installHint.hidden = true;
}

function manualInstallText() {
  if (isiOS) return 'En iPhone o iPad: abre Compartir y selecciona «Añadir a pantalla de inicio».';
  if (isSamsungInternet) return 'En Samsung Internet: abre el menú del navegador y pulsa «Añadir página a» o el icono de instalación, después elige «Pantalla Aplicaciones».';
  if (isAndroid) return 'En Chrome para Android: abre el menú ⋮ y pulsa «Instalar aplicación» o «Añadir a pantalla de inicio». Si ya está instalada en este móvil, Chrome no volverá a ofrecerla.';
  return 'Abre el menú del navegador y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio».';
}

function showManualInstall() {
  if (!installButton || standalone) return;
  installButton.hidden = false;
  installButton.textContent = deferredPrompt ? 'Instalar app' : 'Cómo instalar';
  if (installHint) installHint.textContent = manualInstallText();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.error('No se pudo registrar el service worker', error);
  }
}

registerServiceWorker();

if (standalone) {
  hideInstallUI();
} else {
  window.setTimeout(showManualInstall, 1200);
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  showManualInstall();
});

installButton?.addEventListener('click', async () => {
  if (!deferredPrompt) {
    if (installHint) installHint.hidden = !installHint.hidden;
    return;
  }

  installButton.disabled = true;
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = undefined;
    if (choice.outcome === 'accepted') hideInstallUI();
    else showManualInstall();
  } finally {
    installButton.disabled = false;
  }
});

window.addEventListener('appinstalled', hideInstallUI);
