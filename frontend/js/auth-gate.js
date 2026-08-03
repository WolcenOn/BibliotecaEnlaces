import { api, getToken, setToken } from "./api.js";

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
      message.textContent = error.message;
    }
  });

  (async () => {
    if (!getToken()) {
      openLogin();
      return;
    }
    try {
      await api("/api/v1/me");
      unlock();
    } catch (error) {
      if (error.status === 401) {
        setToken("");
        openLogin("La sesión ha caducado. Inicia sesión de nuevo.");
        return;
      }
      document.documentElement.classList.remove("auth-required");
      if (dialog.open) dialog.close();
      console.error("No se pudo validar temporalmente la sesión", error);
    }
  })();
}
