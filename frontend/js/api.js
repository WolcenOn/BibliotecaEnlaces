const TOKEN_KEY = "musicDiscoveryToken";

export function getApiUrl() {
  return String(window.APP_CONFIG?.apiUrl || "").trim().replace(/\/$/, "");
}

export function setApiUrl() {
  // La URL pública se define en js/config.js durante el despliegue.
}

export function getToken() {
  const current = sessionStorage.getItem(TOKEN_KEY);
  if (current) return current;

  // Migración puntual: elimina tokens persistentes creados por versiones anteriores.
  const legacy = localStorage.getItem(TOKEN_KEY) || "";
  if (legacy) {
    sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
  }
  return legacy;
}

export function setToken(value) {
  localStorage.removeItem(TOKEN_KEY);
  value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const base = getApiUrl();
  if (!base) throw new Error("La aplicación no tiene configurada la URL de la API.");
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Error HTTP ${response.status}`);
  return data;
}
