import { api, setToken } from "./api.js";

const message = document.querySelector("#message");

function values() {
  return {
    email: document.querySelector("#email").value.trim(),
    password: document.querySelector("#password").value
  };
}

function show(text, error = false) {
  message.textContent = text;
  message.setAttribute("role", error ? "alert" : "status");
}

function continueAfterLogin() {
  const shared = sessionStorage.getItem("musicDiscoveryPendingShare");
  if (shared) {
    sessionStorage.removeItem("musicDiscoveryPendingShare");
    location.href = `./library.html?url=${encodeURIComponent(shared)}`;
    return;
  }
  location.href = "./library.html";
}

document.querySelector("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(values()) });
    setToken(result.token);
    continueAfterLogin();
  } catch (error) {
    show(error.message, true);
  }
});

document.querySelector("#resetForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await api("/api/v1/setup/reset-owner-password", {
      method: "POST",
      body: JSON.stringify({
        setupToken: document.querySelector("#resetSetupToken").value,
        email: document.querySelector("#resetEmail").value.trim(),
        password: document.querySelector("#resetPassword").value
      })
    });
    document.querySelector("#email").value = document.querySelector("#resetEmail").value.trim();
    document.querySelector("#password").value = "";
    event.target.reset();
    show("Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.");
  } catch (error) {
    show(error.message, true);
  }
});

document.querySelector("#setupForm").addEventListener("submit", async event => {
  event.preventDefault();
  const credentials = values();
  try {
    const result = await api("/api/v1/setup/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        ...credentials,
        setupToken: document.querySelector("#setupToken").value,
        displayName: document.querySelector("#displayName").value.trim(),
        groupName: document.querySelector("#groupName").value.trim()
      })
    });
    setToken(result.token);
    continueAfterLogin();
  } catch (error) {
    show(error.message, true);
  }
});
