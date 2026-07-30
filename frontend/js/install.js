const installButton = document.querySelector("#installButton");
const installHint = document.querySelector("#installHint");
let deferredPrompt;

const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

function hideInstallUI() {
  if (installButton) installButton.hidden = true;
  if (installHint) installHint.hidden = true;
}

if (standalone) {
  hideInstallUI();
} else if (isiOS && installButton) {
  installButton.hidden = false;
  installButton.textContent = "Instalar app";
  installButton.addEventListener("click", () => {
    if (installHint) installHint.hidden = !installHint.hidden;
  });
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPrompt = event;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = undefined;
  if (choice.outcome === "accepted") hideInstallUI();
});

window.addEventListener("appinstalled", hideInstallUI);
