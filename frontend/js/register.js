import { api, setToken } from "./api.js";

const form = document.querySelector("#registerForm");
const message = document.querySelector("#registerMessage");

form?.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "Creando tu biblioteca…";
  try {
    const result = await api("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: document.querySelector("#displayName").value.trim(),
        email: document.querySelector("#email").value.trim(),
        password: document.querySelector("#password").value,
        groupName: document.querySelector("#groupName").value.trim()
      })
    });
    setToken(result.token);
    location.href = "./resources.html";
  } catch (error) {
    setToken("");
    message.textContent = error.message;
  }
});
