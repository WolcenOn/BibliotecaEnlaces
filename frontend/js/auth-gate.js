import { api, getApiUrl, setApiUrl, setToken } from "./api.js";

const dialog = document.querySelector("#loginDialog");
const form = document.querySelector("#inlineLoginForm");
const message = document.querySelector("#inlineLoginMessage");
const apiInput = document.querySelector("#inlineApiUrl");

if (dialog && form) {
  apiInput.value = getApiUrl();

  const openLogin = (text = "Inicia sesión para continuar.") => {
    document.documentElement.classList.add("auth-required");
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
    setApiUrl(apiInput.value);
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
    } catch (error) {
      setToken("");
      openLogin(error.message === "Configura primero la URL de Railway." ? error.message : "La sesión no existe o ha caducado.");
    }
  })();
}
