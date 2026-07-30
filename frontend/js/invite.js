import { api, getApiUrl, setApiUrl } from "./api.js";

const params = new URLSearchParams(location.search);
const token = params.get("token")?.trim();
const apiFromLink = params.get("api")?.trim();
const apiUrl = document.querySelector("#apiUrl");
const message = document.querySelector("#message");

if (apiFromLink) setApiUrl(apiFromLink);
apiUrl.value = getApiUrl();

if (!token) {
  message.textContent = "El enlace no contiene un token de invitación válido.";
  document.querySelector("button").disabled = true;
}

document.querySelector("#inviteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setApiUrl(apiUrl.value);
  try {
    await api(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: JSON.stringify({
        displayName: document.querySelector("#displayName").value.trim(),
        email: document.querySelector("#email").value.trim(),
        password: document.querySelector("#password").value
      })
    });
    message.textContent = "Solicitud enviada. Podrás entrar cuando un administrador la apruebe.";
    event.target.reset();
    apiUrl.value = getApiUrl();
  } catch (error) {
    message.textContent = error.message;
    message.setAttribute("role", "alert");
  }
});