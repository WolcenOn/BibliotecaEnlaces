const API_KEY = "musicDiscoveryApiUrl";
const TOKEN_KEY = "musicDiscoveryToken";

export function getApiUrl() {
  return (localStorage.getItem(API_KEY) || "").replace(/\/$/, "");
}

export function setApiUrl(value) {
  localStorage.setItem(API_KEY, value.trim().replace(/\/$/, ""));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(value) {
  value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const base = getApiUrl();
  if (!base) throw new Error("Configura primero la URL de Railway.");
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Error HTTP ${response.status}`);
  return data;
}
