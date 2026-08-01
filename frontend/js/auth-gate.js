import { api, setToken } from "./api.js";

const dialog = document.querySelector("#loginDialog");
const form = document.querySelector("#inlineLoginForm");
const message = document.querySelector("#inlineLoginMessage");

if (dialog && form) {
  document.documentElement.classList.add("auth-required");
  dialog.addEventListener("cancel", event => event.preventDefault());

  const openLogin = (text = "Inicia sesión para continuar.") => {
    message.textContent = text;
    if (!dialog.open) dialog.showModal();
    setTimeout(() => document.querySelector("#inlineEmail")?.focus(), 50);
  };

  const unlock = () => {
    document.documentElement.classList.remove("auth-required");
    if (dialog.open) dialog.close();
  };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "Comprobando acceso…";
    try {
      const result = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.querySelector("#inlineEmail").value.trim(),
          password: document.querySelector("#inlinePassword").value
        })
      });
      setToken(result.token);
      unlock();
      location.reload();
    } catch (error) {
      setToken("");
      message.textContent = error.message;
    }
  });

  (async () => {
    try {
      await api("/api/v1/me");
      unlock();
    } catch {
      setToken("");
      openLogin("La sesión no existe o ha caducado.");
    }
  })();
}
