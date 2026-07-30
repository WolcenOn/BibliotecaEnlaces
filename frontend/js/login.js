import { api, getApiUrl, setApiUrl, setToken } from "./api.js";

const apiUrl = document.querySelector("#apiUrl");
const message = document.querySelector("#message");
apiUrl.value = getApiUrl();

function values() {
  setApiUrl(apiUrl.value);
  return {
    email: document.querySelector("#email").value.trim(),
    password: document.querySelector("#password").value
  };
}

function show(text, error = false) {
  message.textContent = text;
  message.setAttribute("role", error ? "alert" : "status");
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/v1/auth/login", { method: "POST", body: JSON.stringify(values()) });
    setToken(result.token);
    location.href = "./admin.html";
  } catch (error) {
    show(error.message, true);
  }
});

document.querySelector("#setupForm").addEventListener("submit", async (event) => {
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
    location.href = "./admin.html";
  } catch (error) {
    show(error.message, true);
  }
});
