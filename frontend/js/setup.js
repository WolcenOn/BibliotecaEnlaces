import { api, setToken } from "./api.js";

const form = document.querySelector("#setupForm");
const message = document.querySelector("#setupMessage");
const submitButton = form?.querySelector('button[type="submit"]');

form?.addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.querySelector("#password").value;
  const passwordConfirm = document.querySelector("#passwordConfirm").value;
  if (password !== passwordConfirm) {
    message.textContent = "Las contraseñas no coinciden.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Creando administrador y biblioteca…";
  const email = document.querySelector("#email").value.trim();

  try {
    await api("/api/v1/setup/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        setupToken: document.querySelector("#setupToken").value,
        email,
        password,
        displayName: document.querySelector("#displayName").value.trim(),
        groupName: document.querySelector("#groupName").value.trim()
      })
    });

    const login = await api("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(login.token);
    message.textContent = "Configuración completada. Abriendo la biblioteca…";
    location.href = "./resources.html";
  } catch (error) {
    message.textContent = error.message;
    submitButton.disabled = false;
  }
});
