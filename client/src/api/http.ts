import { isNative } from "../lib/platform";
import { getAuthToken, clearAuthToken } from "./authToken";

function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_URL;
  if (typeof envBase === "string" && envBase.length > 0) return envBase.replace(/\/$/, "");
  if (isNative()) {
    throw new Error(
      "VITE_API_URL must be set for native builds — relative URLs cannot reach the backend from a Capacitor WebView.",
    );
  }
  if (import.meta.env.DEV) return "http://localhost:4000";
  return "";
}

const API_BASE = resolveApiBase();

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  // Native builds can't rely on cookies — attach the JWT as a Bearer token.
  // Web keeps cookie-based auth for backwards compatibility.
  if (isNative()) {
    const token = await getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: isNative() ? "omit" : "include",
    headers,
  });

  if (response.status === 401 && isNative()) {
    await clearAuthToken();
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export { API_BASE };
