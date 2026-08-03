const TOKEN_KEY = "bibliotecaEnlacesToken";
const LEGACY_TOKEN_KEYS = ["musicDiscoveryToken"];
const PUBLIC_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/setup/bootstrap",
  "/api/v1/invitations/"
];

export function getApiUrl() {
  return String(window.APP_CONFIG?.apiUrl || "").trim().replace(/\/$/, "");
}

export function setApiUrl() {
  // La URL pública se define en js/config.js durante el despliegue.
}

export function getToken() {
  const current = localStorage.getItem(TOKEN_KEY);
  if (current) return current;

  for (const key of LEGACY_TOKEN_KEYS) {
    const legacy = localStorage.getItem(key) || sessionStorage.getItem(key) || "";
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy);
      return legacy;
    }
  }
  return "";
}

export function setToken(value) {
  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  sessionStorage.removeItem(TOKEN_KEY);
  value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY);
}

function isPublicPath(path) {
  return PUBLIC_PATHS.some(publicPath =>
    publicPath.endsWith("/") ? path.startsWith(publicPath) : path === publicPath
  );
}

export async function api(path, options = {}) {
  const base = getApiUrl();
  if (!base) throw new Error("La aplicación no tiene configurada la URL de la API.");

  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (!isPublicPath(path)) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      mode: "cors",
      cache: "no-store"
    });
  } catch (error) {
    console.error("API network error", { path, base, error });
    throw new Error(`No se pudo conectar con la API (${path}). Revisa CORS o la conexión y recarga la aplicación.`);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status === 401 && !isPublicPath(path)) setToken("");
  if (!response.ok) throw new Error(data?.error || `Error HTTP ${response.status}`);
  return data;
}
